import { Injectable } from '@nestjs/common';
import { AttendanceStatus, Lesson } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { ClockService } from '../common/clock.service';
import { AppError } from '../common/errors';
import { spreadsheetSafe } from '../common/util';
import type { AuthUser } from '../common/auth-user';
import type { RequestMeta } from '../common/decorators';

const MAX_RANGE_DAYS = 400;
const HELD = ['ENDED', 'LOCKED'] as const;

type StudentInfo = { id: string; name: string; email: string; facultyNumber: string | null; group: string | null };
type Row = { onTime: number; late: number; absent: number; excused: number; removed: number; expected: number };

/** Local wall-clock → UTC for a given IANA zone (reports use the university zone, storage is UTC). */
export function zonedMidnightUtc(dateStr: string, timeZone: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(guess))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(guess - (asUtc - guess));
}

export function localDateStr(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Monday of the week containing `date` in the university zone (spec 22.1 RPT-02). */
export function weekStartOf(date: Date, timeZone: string) {
  const local = localDateStr(date, timeZone);
  const [y, m, d] = local.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const monday = new Date(Date.UTC(y, m - 1, d - ((dow + 6) % 7)));
  return monday.toISOString().slice(0, 10);
}

const addDays = (dateStr: string, n: number) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

function bucket(status: AttendanceStatus | undefined): keyof Row {
  switch (status) {
    case 'PRESENT':
    case 'MANUAL_PRESENT':
      return 'onTime';
    case 'LATE':
    case 'MANUAL_LATE':
      return 'late';
    case 'EXCUSED':
      return 'excused';
    case 'REMOVED_FROM_SESSION':
      return 'removed';
    default:
      return 'absent';
  }
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly clock: ClockService,
  ) {}

  private parseRange(from?: string, to?: string) {
    const re = /^\d{4}-\d{2}-\d{2}$/;
    const today = new Date().toISOString().slice(0, 10);
    const f = from && re.test(from) ? from : addDays(today, -120);
    const t = to && re.test(to) ? to : today;
    const days = (Date.parse(t) - Date.parse(f)) / 86400_000;
    if (days < 0 || days > MAX_RANGE_DAYS) throw new AppError('REPORT_RANGE_TOO_LARGE', `Choose a period of at most ${MAX_RANGE_DAYS} days`);
    return { from: f, to: t };
  }

  /** Aggregates attendance with historical membership (spec 22.3). */
  private async aggregate(lessons: (Lesson & { course: { id: string; code: string; title: string } })[], courseIds: string[]) {
    const s = await this.settings.get();
    const held = lessons.filter((l) => (HELD as readonly string[]).includes(l.status));
    const lessonIds = held.map((l) => l.id);
    const [enrollments, records, corrections] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { courseId: { in: courseIds } },
        include: { student: { select: { id: true, name: true, email: true, studentProfile: { select: { facultyNumber: true, group: true } } } } },
      }),
      this.prisma.attendance.findMany({ where: { lessonId: { in: lessonIds } } }),
      this.prisma.attendanceEvent.groupBy({ by: ['attendanceId'], where: { attendance: { lessonId: { in: lessonIds } }, action: { in: ['MANUAL_CORRECTION', 'REMOVED', 'READMITTED'] } }, _count: true }),
    ]);
    const correctionCount = new Map(corrections.map((c) => [c.attendanceId, c._count]));
    const recordMap = new Map(records.map((r) => [`${r.lessonId}|${r.studentId}`, r]));
    const students = new Map<string, StudentInfo>();
    for (const e of enrollments) {
      students.set(e.studentId, { id: e.student.id, name: e.student.name, email: e.student.email, facultyNumber: e.student.studentProfile?.facultyNumber ?? null, group: e.student.studentProfile?.group ?? null });
    }
    const enrolledAt = (courseId: string, studentId: string, at: Date) =>
      enrollments.some((e) => e.courseId === courseId && e.studentId === studentId && e.validFrom <= at && (!e.validTo || e.validTo > at));

    const perStudent = new Map<string, Row & { courseId: string }>();
    const perLesson: any[] = [];
    const details: any[] = [];
    for (const l of held) {
      const at = l.actualStartedAt ?? l.startsAt;
      const ids = new Set<string>();
      for (const e of enrollments) if (e.courseId === l.courseId && enrolledAt(l.courseId, e.studentId, at)) ids.add(e.studentId);
      for (const r of records) if (r.lessonId === l.id) ids.add(r.studentId); // anyone with a record is part of history
      const lc = { enrolled: ids.size, onTime: 0, late: 0, absent: 0, excused: 0, removed: 0, corrections: 0 };
      for (const sid of ids) {
        const rec = recordMap.get(`${l.id}|${sid}`);
        const b = bucket(rec?.status);
        (lc as any)[b]++;
        if (rec && correctionCount.get(rec.id)) lc.corrections++;
        const key = `${l.courseId}|${sid}`;
        const row = perStudent.get(key) ?? { courseId: l.courseId, onTime: 0, late: 0, absent: 0, excused: 0, removed: 0, expected: 0 };
        row[b]++;
        if (b !== 'excused' || s.excusedCountsInDenominator) row.expected++;
        perStudent.set(key, row);
        details.push({ lesson: l, studentId: sid, record: rec ?? null, corrected: !!(rec && rec.manuallyCorrected) });
      }
      perLesson.push({ lesson: l, ...lc });
    }
    // include enrolled students without any held lesson (spec: "включително без нито едно присъствие")
    for (const e of enrollments) {
      const key = `${e.courseId}|${e.studentId}`;
      if (!perStudent.has(key) && e.state === 'ACTIVE') perStudent.set(key, { courseId: e.courseId, onTime: 0, late: 0, absent: 0, excused: 0, removed: 0, expected: 0 });
    }
    const rate = (r: Row) => (r.expected ? Math.round(((r.onTime + (s.lateCountsAsPresent ? r.late : 0)) / r.expected) * 1000) / 10 : null);
    return { held, students, perStudent, perLesson, details, rate, settings: s, cancelled: lessons.filter((l) => l.status === 'CANCELLED').length };
  }

  async courseSummary(user: AuthUser, courseId: string, from?: string, to?: string) {
    await this.access.assertCourseStaff(user, courseId);
    const range = this.parseRange(from, to);
    const s = await this.settings.get();
    const lessons = await this.prisma.lesson.findMany({
      where: { courseId, startsAt: { gte: zonedMidnightUtc(range.from, s.universityTimeZone), lt: zonedMidnightUtc(addDays(range.to, 1), s.universityTimeZone) } },
      include: { course: { select: { id: true, code: true, title: true } } },
      orderBy: { startsAt: 'asc' },
    });
    const agg = await this.aggregate(lessons, [courseId]);
    const students = [...agg.perStudent.entries()]
      .map(([key, r]) => {
        const st = agg.students.get(key.split('|')[1])!;
        return { studentId: st.id, name: st.name, facultyNumber: st.facultyNumber, ...r, rate: agg.rate(r) };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return { range, lessonsHeld: agg.held.length, cancelled: agg.cancelled, students };
  }

  // ------------------------------------------------------------------ XLSX
  async courseXlsx(user: AuthUser, courseId: string, from: string | undefined, to: string | undefined, meta: RequestMeta) {
    await this.access.assertCourseStaff(user, courseId);
    const range = this.parseRange(from, to);
    const s = await this.settings.get();
    const course = await this.prisma.course.findUniqueOrThrow({ where: { id: courseId }, include: { owner: { select: { name: true } } } });
    const lessons = await this.prisma.lesson.findMany({
      where: { courseId, startsAt: { gte: zonedMidnightUtc(range.from, s.universityTimeZone), lt: zonedMidnightUtc(addDays(range.to, 1), s.universityTimeZone) } },
      include: { course: { select: { id: true, code: true, title: true } } },
      orderBy: { startsAt: 'asc' },
    });
    const wb = await this.build(lessons, [courseId], {
      title: `${course.code} ${course.title}`,
      teacher: course.owner.name,
      period: `${range.from} – ${range.to}`,
    });
    await this.audit.log({ actor: user, action: 'report.exported', targetType: 'course', targetId: courseId, metadata: { report: 'RPT-01', ...range }, ip: meta.ip });
    return { buffer: await wb.xlsx.writeBuffer(), filename: safeName(`attendance_${course.code}_${range.from}_${range.to}.xlsx`) };
  }

  async weeklyXlsx(user: AuthUser, weekStart: string | undefined, teacherId: string | undefined, meta: RequestMeta) {
    const s = await this.settings.get();
    const start = weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart) ? weekStartOf(zonedMidnightUtc(weekStart, s.universityTimeZone), s.universityTimeZone) : weekStartOf(this.clock.now(), s.universityTimeZone);
    const end = addDays(start, 7);
    let courseIds: string[];
    let teacherName = user.name;
    if (user.role === 'ADMIN' && teacherId) {
      courseIds = await this.access.teacherCourseIds(teacherId);
      teacherName = (await this.prisma.user.findUnique({ where: { id: teacherId } }))?.name ?? '';
    } else if (user.role === 'ADMIN') {
      courseIds = (await this.prisma.course.findMany({ select: { id: true } })).map((c) => c.id);
      teacherName = 'All teachers';
    } else {
      courseIds = await this.access.teacherCourseIds(user.id);
    }
    const lessons = await this.prisma.lesson.findMany({
      where: { courseId: { in: courseIds }, startsAt: { gte: zonedMidnightUtc(start, s.universityTimeZone), lt: zonedMidnightUtc(end, s.universityTimeZone) }, status: { in: ['ENDED', 'LOCKED', 'CANCELLED'] } },
      include: { course: { select: { id: true, code: true, title: true } } },
      orderBy: [{ courseId: 'asc' }, { startsAt: 'asc' }],
    });
    const wb = await this.build(lessons, [...new Set(lessons.map((l) => l.courseId))], { title: 'Weekly report', teacher: teacherName, period: `${start} – ${addDays(end, -1)}` });
    await this.audit.log({ actor: user, action: 'report.exported', targetType: 'weekly', metadata: { report: 'RPT-02', weekStart: start, teacherId }, ip: meta.ip });
    return { buffer: await wb.xlsx.writeBuffer(), filename: safeName(`weekly_${start}.xlsx`) };
  }

  async weeklySummary(user: AuthUser, weekStart: string | undefined, teacherId?: string) {
    const s = await this.settings.get();
    const start = weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart) ? weekStartOf(zonedMidnightUtc(weekStart, s.universityTimeZone), s.universityTimeZone) : weekStartOf(this.clock.now(), s.universityTimeZone);
    const end = addDays(start, 7);
    const courseIds = user.role === 'ADMIN' ? (teacherId ? await this.access.teacherCourseIds(teacherId) : (await this.prisma.course.findMany({ select: { id: true } })).map((c) => c.id)) : await this.access.teacherCourseIds(user.id);
    const lessons = await this.prisma.lesson.findMany({
      where: { courseId: { in: courseIds }, startsAt: { gte: zonedMidnightUtc(start, s.universityTimeZone), lt: zonedMidnightUtc(end, s.universityTimeZone) }, status: { in: ['ENDED', 'LOCKED', 'CANCELLED'] } },
      include: { course: { select: { id: true, code: true, title: true } } },
      orderBy: { startsAt: 'asc' },
    });
    const agg = await this.aggregate(lessons, [...new Set(lessons.map((l) => l.courseId))]);
    const byCourse = new Map<string, any>();
    for (const l of lessons) {
      const c = byCourse.get(l.courseId) ?? { course: l.course, held: 0, cancelled: 0, onTime: 0, late: 0, absent: 0, lessons: [] as any[] };
      if (l.status === 'CANCELLED') c.cancelled++;
      byCourse.set(l.courseId, c);
    }
    for (const pl of agg.perLesson) {
      const c = byCourse.get(pl.lesson.courseId);
      c.held++;
      c.onTime += pl.onTime;
      c.late += pl.late;
      c.absent += pl.absent + pl.removed;
      c.lessons.push({ id: pl.lesson.id, startsAt: pl.lesson.startsAt, title: pl.lesson.title, enrolled: pl.enrolled, onTime: pl.onTime, late: pl.late, absent: pl.absent + pl.removed });
    }
    return { weekStart: start, weekEnd: addDays(end, -1), timeZone: s.universityTimeZone, courses: [...byCourse.values()] };
  }

  async lessonXlsx(user: AuthUser, lessonId: string, meta: RequestMeta) {
    const lesson = await this.access.assertLessonStaff(user, lessonId);
    const full = await this.prisma.lesson.findUniqueOrThrow({ where: { id: lessonId }, include: { course: { select: { id: true, code: true, title: true } }, teacher: { select: { name: true } } } });
    const wb = await this.build([full], [lesson.courseId], { title: `${full.course.code} ${full.course.title} – ${full.title ?? ''}`, teacher: full.teacher.name, period: '' });
    await this.audit.log({ actor: user, action: 'report.exported', targetType: 'lesson', targetId: lessonId, metadata: { report: 'RPT-03' }, ip: meta.ip });
    return { buffer: await wb.xlsx.writeBuffer(), filename: safeName(`lesson_${full.course.code}_${localDateStr(full.startsAt, (await this.settings.get()).universityTimeZone)}.xlsx`) };
  }

  /** Four-sheet workbook (spec 22.2): Summary, By student, By lesson, Details. */
  private async build(lessons: any[], courseIds: string[], info: { title: string; teacher: string; period: string }) {
    const agg = await this.aggregate(lessons, courseIds);
    const tz = agg.settings.universityTimeZone;
    const fmtDate = (d: Date | null | undefined) => (d ? new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d) : '');
    const fmtTime = (d: Date | null | undefined) => (d ? new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(d) : '');
    const courses = new Map<string, { code: string; title: string }>(lessons.map((l) => [l.courseId, l.course]));
    const safe = (v: unknown) => spreadsheetSafe(v) as any;

    const wb = new ExcelJS.Workbook();
    wb.creator = `${agg.settings.universityName} attendance platform`;
    wb.created = this.clock.now();
    const header = (ws: ExcelJS.Worksheet, cols: { header: string; key: string; width: number }[]) => {
      ws.columns = cols;
      const row = ws.getRow(1);
      row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7C86' } };
      row.alignment = { vertical: 'middle' };
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    };
    const statusFill: Record<string, string> = { onTime: 'FFDCFCE7', late: 'FFFEF3C7', absent: 'FFFEE2E2', excused: 'FFE0F2FE', removed: 'FFF1F5F9' };

    // Summary
    const sum = wb.addWorksheet('Summary');
    const totals = agg.perLesson.reduce((a, l) => ({ onTime: a.onTime + l.onTime, late: a.late + l.late, expected: a.expected + l.enrolled - l.excused }), { onTime: 0, late: 0, expected: 0 });
    const rows: [string, unknown][] = [
      ['University', agg.settings.universityName],
      ['Report', info.title],
      ['Course(s)', [...courses.values()].map((c) => `${c.code} ${c.title}`).join('; ')],
      ['Teacher', info.teacher],
      ['Period', info.period],
      ['Generated at', `${fmtDate(this.clock.now())} ${fmtTime(this.clock.now())}`],
      ['Time zone', tz],
      ['Lessons held', agg.held.length],
      ['Cancelled lessons (not counted)', agg.cancelled],
      ['Enrolled students', new Set([...agg.perStudent.keys()].map((k) => k.split('|')[1])).size],
      ['On-time check-ins', totals.onTime],
      ['Late check-ins', totals.late],
      ['Attendance rate', totals.expected ? (totals.onTime + (agg.settings.lateCountsAsPresent ? totals.late : 0)) / totals.expected : 'N/A'],
      ['Rule: late counts as present', agg.settings.lateCountsAsPresent ? 'yes (separate column)' : 'no'],
      ['Rule: excused absences in denominator', agg.settings.excusedCountsInDenominator ? 'yes' : 'no'],
    ];
    if (!agg.held.length) rows.push(['Note', 'No lessons were held in the selected period']);
    sum.columns = [{ width: 36 }, { width: 60 }];
    rows.forEach(([k, v]) => {
      const r = sum.addRow([k, safe(v)]);
      r.getCell(1).font = { bold: true };
    });
    const rateCell = sum.getRow(13).getCell(2);
    if (typeof rateCell.value === 'number') rateCell.numFmt = '0.0%';

    // By student
    const bs = wb.addWorksheet('By student');
    header(bs, [
      { header: 'Faculty number', key: 'fn', width: 16 },
      { header: 'Name', key: 'name', width: 28 },
      { header: 'E-mail', key: 'email', width: 30 },
      { header: 'Group', key: 'group', width: 8 },
      { header: 'Course', key: 'course', width: 12 },
      { header: 'Lessons held', key: 'held', width: 13 },
      { header: 'On time', key: 'onTime', width: 10 },
      { header: 'Late', key: 'late', width: 8 },
      { header: 'Absent', key: 'absent', width: 9 },
      { header: 'Excused', key: 'excused', width: 9 },
      { header: 'Removed', key: 'removed', width: 9 },
      { header: 'Attendance %', key: 'rate', width: 13 },
    ]);
    [...agg.perStudent.entries()]
      .map(([key, r]) => ({ st: agg.students.get(key.split('|')[1])!, r }))
      .sort((a, b) => a.st.name.localeCompare(b.st.name))
      .forEach(({ st, r }) => {
        const rate = agg.rate(r);
        const row = bs.addRow({
          fn: safe(st.facultyNumber ?? ''),
          name: safe(st.name),
          email: safe(st.email),
          group: safe(st.group ?? ''),
          course: safe(courses.get(r.courseId)?.code ?? ''),
          held: r.onTime + r.late + r.absent + r.excused + r.removed,
          onTime: r.onTime,
          late: r.late,
          absent: r.absent,
          excused: r.excused,
          removed: r.removed,
          rate: rate == null ? 'N/A' : rate / 100,
        });
        if (rate != null) row.getCell('rate').numFmt = '0.0%';
      });

    // By lesson
    const bl = wb.addWorksheet('By lesson');
    header(bl, [
      { header: 'Course', key: 'course', width: 12 },
      { header: 'Lesson ID', key: 'id', width: 38 },
      { header: 'Title', key: 'title', width: 24 },
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Planned start', key: 'planned', width: 13 },
      { header: 'Actual start', key: 'actual', width: 13 },
      { header: 'End', key: 'end', width: 10 },
      { header: 'Status', key: 'status', width: 11 },
      { header: 'Enrolled', key: 'enrolled', width: 10 },
      { header: 'On time', key: 'onTime', width: 10 },
      { header: 'Late', key: 'late', width: 8 },
      { header: 'Absent', key: 'absent', width: 9 },
      { header: 'Manual corrections', key: 'corr', width: 18 },
    ]);
    const lessonStats = new Map(agg.perLesson.map((p) => [p.lesson.id, p]));
    for (const l of lessons) {
      const p = lessonStats.get(l.id);
      bl.addRow({
        course: safe(l.course.code),
        id: l.id,
        title: safe(l.title ?? ''),
        date: fmtDate(l.startsAt),
        planned: fmtTime(l.startsAt),
        actual: fmtTime(l.actualStartedAt),
        end: fmtTime(l.endedAt),
        status: l.status,
        enrolled: p?.enrolled ?? '',
        onTime: p?.onTime ?? '',
        late: p?.late ?? '',
        absent: p ? p.absent + p.removed : '',
        corr: p?.corrections ?? '',
      });
    }

    // Details
    const dt = wb.addWorksheet('Details');
    header(dt, [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Course', key: 'course', width: 12 },
      { header: 'Lesson', key: 'lesson', width: 22 },
      { header: 'Faculty number', key: 'fn', width: 16 },
      { header: 'Student', key: 'student', width: 28 },
      { header: 'Status', key: 'status', width: 22 },
      { header: 'AprilTag confirmed at', key: 'at', width: 20 },
      { header: 'Manually corrected', key: 'corr', width: 18 },
      { header: 'Correction reason', key: 'reason', width: 40 },
    ]);
    agg.details
      .sort((a, b) => a.lesson.startsAt - b.lesson.startsAt || (agg.students.get(a.studentId)?.name ?? '').localeCompare(agg.students.get(b.studentId)?.name ?? ''))
      .forEach((d) => {
        const st = agg.students.get(d.studentId);
        const status = d.record?.status ?? 'ABSENT';
        const row = dt.addRow({
          date: fmtDate(d.lesson.startsAt),
          course: safe(d.lesson.course.code),
          lesson: safe(d.lesson.title ?? ''),
          fn: safe(st?.facultyNumber ?? ''),
          student: safe(st?.name ?? ''),
          status,
          at: d.record?.evidenceType === 'APRILTAG' ? fmtTime(d.record.verifiedAt) : '',
          corr: d.corrected ? 'yes' : 'no',
          reason: safe(d.corrected ? d.record?.lastReason ?? '' : ''),
        });
        row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusFill[bucket(status)] } };
      });
    return wb;
  }
}

function safeName(name: string) {
  return name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120);
}
