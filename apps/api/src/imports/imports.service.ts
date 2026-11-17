import { Injectable } from '@nestjs/common';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { ClockService } from '../common/clock.service';
import { AppError } from '../common/errors';
import { normaliseEmail, sha256 } from '../common/util';
import type { AuthUser } from '../common/auth-user';
import type { RequestMeta } from '../common/decorators';

/** Column aliases (English, Bulgarian, Turkish) → canonical field. Headers are matched case-insensitively. */
const ALIASES: Record<string, string[]> = {
  email: ['email', 'e-mail', 'mail', 'имейл', 'e-posta', 'eposta'],
  name: ['name', 'full name', 'fullname', 'име', 'ad soyad', 'adsoyad', 'isim'],
  role: ['role', 'роля', 'rol'],
  facultyNumber: ['faculty number', 'facultynumber', 'faculty_number', 'student number', 'student_no', 'факултетен номер', 'фак. номер', 'fn', 'öğrenci no', 'ogrenci no', 'numara'],
  universityId: ['university id', 'universityid', 'university_id', 'id', 'егн', 'tc', 'personel no'],
  programme: ['programme', 'program', 'programme_name', 'специалност', 'bölüm', 'bolum'],
  year: ['year', 'курс', 'sınıf', 'sinif'],
  group: ['group', 'група', 'grup', 'şube', 'sube'],
  department: ['department', 'катедра', 'anabilim dalı', 'birim'],
  courseCode: ['course', 'course code', 'course_code', 'курс код', 'дисциплина', 'ders kodu', 'ders'],
};

export interface ImportRow {
  line: number;
  email: string;
  name: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN';
  facultyNumber?: string | null;
  universityId?: string | null;
  programme?: string | null;
  year?: number | null;
  group?: string | null;
  department?: string | null;
  courseCode?: string | null;
  action: 'CREATE' | 'ENROLL_ONLY' | 'SKIP' | 'ERROR';
  errors: string[];
  existingUserId?: string | null;
}

const MAX_ROWS = 5000;

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
  ) {}

  async parse(file: { originalname: string; buffer: Buffer }): Promise<Record<string, string>[]> {
    const name = file.originalname.toLowerCase();
    if (name.endsWith('.xlsx')) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(file.buffer as any);
      const ws = wb.worksheets[0];
      if (!ws) return [];
      const header: string[] = [];
      ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => (header[i] = String(c.text ?? '').trim()));
      const out: Record<string, string>[] = [];
      ws.eachRow((row, n) => {
        if (n === 1) return;
        const rec: Record<string, string> = {};
        header.forEach((h, i) => h && (rec[h] = String(row.getCell(i).text ?? '').trim()));
        if (Object.values(rec).some(Boolean)) out.push(rec);
      });
      return out;
    }
    if (name.endsWith('.csv') || name.endsWith('.txt')) {
      const text = file.buffer.toString('utf8').replace(/^﻿/, '');
      const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim() });
      return res.data;
    }
    throw new AppError('VALIDATION_FAILED', 'Upload a .csv or .xlsx file');
  }

  private mapColumns(headers: string[]) {
    const map: Record<string, string> = {};
    for (const h of headers) {
      const key = h.trim().toLowerCase();
      for (const [field, aliases] of Object.entries(ALIASES)) if (!map[field] && aliases.includes(key)) map[field] = h;
    }
    return map;
  }

  async preview(actor: AuthUser, file: { originalname: string; buffer: Buffer }, defaults: { role?: string; courseCode?: string }) {
    const raw = await this.parse(file);
    if (!raw.length) throw new AppError('VALIDATION_FAILED', 'The file has no data rows');
    if (raw.length > MAX_ROWS) throw new AppError('VALIDATION_FAILED', `At most ${MAX_ROWS} rows per import`);
    const columns = this.mapColumns(Object.keys(raw[0]));
    if (!columns.email || !columns.name) throw new AppError('VALIDATION_FAILED', 'The file needs at least the columns "email" and "name"');

    const get = (r: Record<string, string>, f: string) => (columns[f] ? (r[columns[f]] ?? '').toString().trim() : '');
    const emails = raw.map((r) => normaliseEmail(get(r, 'email'))).filter(Boolean);
    const fns = raw.map((r) => get(r, 'facultyNumber')).filter(Boolean);
    const existing = await this.prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true, role: true } });
    const takenFn = await this.prisma.studentProfile.findMany({ where: { facultyNumber: { in: fns } }, select: { facultyNumber: true, user: { select: { email: true } } } });
    const codes = [...new Set(raw.map((r) => get(r, 'courseCode') || defaults.courseCode || '').filter(Boolean))];
    const courses = await this.prisma.course.findMany({ where: { code: { in: codes }, status: 'ACTIVE' }, select: { id: true, code: true } });

    const seenEmail = new Set<string>();
    const seenFn = new Set<string>();
    const rows: ImportRow[] = raw.map((r, i) => {
      const errors: string[] = [];
      const email = normaliseEmail(get(r, 'email'));
      const roleRaw = (get(r, 'role') || defaults.role || 'STUDENT').toUpperCase();
      const role = (['STUDENT', 'TEACHER', 'ADMIN'].includes(roleRaw) ? roleRaw : roleRaw.startsWith('ST') || roleRaw.startsWith('СТ') ? 'STUDENT' : roleRaw.startsWith('T') || roleRaw.startsWith('П') ? 'TEACHER' : 'INVALID') as any;
      const yearRaw = get(r, 'year');
      const year = yearRaw ? Number.parseInt(yearRaw, 10) : null;
      const row: ImportRow = {
        line: i + 2,
        email,
        name: get(r, 'name'),
        role,
        facultyNumber: get(r, 'facultyNumber') || null,
        universityId: get(r, 'universityId') || null,
        programme: get(r, 'programme') || null,
        year: Number.isFinite(year as number) ? year : null,
        group: get(r, 'group') || null,
        department: get(r, 'department') || null,
        courseCode: get(r, 'courseCode') || defaults.courseCode || null,
        action: 'CREATE',
        errors,
      };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Invalid e-mail');
      if (row.name.length < 2) errors.push('Name is missing');
      if (role === 'INVALID') errors.push(`Unknown role "${roleRaw}"`);
      if (role === 'STUDENT' && !row.facultyNumber) errors.push('Faculty number is missing');
      if (yearRaw && !(row.year && row.year >= 1 && row.year <= 10)) errors.push('Year must be 1–10');
      if (seenEmail.has(email)) errors.push('Duplicate e-mail in the file');
      if (row.facultyNumber && seenFn.has(row.facultyNumber)) errors.push('Duplicate faculty number in the file');
      seenEmail.add(email);
      if (row.facultyNumber) seenFn.add(row.facultyNumber);
      if (row.courseCode && !courses.find((c) => c.code === row.courseCode)) errors.push(`Course ${row.courseCode} not found`);

      const ex = existing.find((u) => u.email === email);
      if (ex) {
        row.existingUserId = ex.id;
        row.action = row.courseCode && ex.role === 'STUDENT' ? 'ENROLL_ONLY' : 'SKIP';
      } else if (row.facultyNumber) {
        const clash = takenFn.find((f) => f.facultyNumber === row.facultyNumber);
        if (clash) errors.push(`Faculty number belongs to ${clash.user.email}`);
      }
      if (errors.length) row.action = 'ERROR';
      return row;
    });

    const summary = {
      total: rows.length,
      create: rows.filter((r) => r.action === 'CREATE').length,
      enrollOnly: rows.filter((r) => r.action === 'ENROLL_ONLY').length,
      skip: rows.filter((r) => r.action === 'SKIP').length,
      errors: rows.filter((r) => r.action === 'ERROR').length,
      columns,
    };
    const batch = await this.prisma.importBatch.create({
      data: { createdById: actor.id, fileName: file.originalname.slice(0, 200), fileHash: sha256(file.buffer.toString('base64')), rows: rows as any, summary },
    });
    return { batchId: batch.id, fileName: batch.fileName, summary, rows };
  }

  async commit(actor: AuthUser, batchId: string, opts: { sendInvites: boolean }, meta: RequestMeta) {
    const claimed = await this.prisma.importBatch.updateMany({ where: { id: batchId, createdById: actor.id, status: 'PREVIEW' }, data: { status: 'COMMITTING' } });
    if (!claimed.count) throw new AppError('CONFLICT', 'This import was already committed or does not exist');
    const batch = await this.prisma.importBatch.findUniqueOrThrow({ where: { id: batchId } });
    const rows = batch.rows as unknown as ImportRow[];
    const courses = await this.prisma.course.findMany({ where: { code: { in: rows.map((r) => r.courseCode!).filter(Boolean) } }, select: { id: true, code: true } });
    const report: { line: number; email: string; result: string; message?: string; activationUrl?: string | null; tempPassword?: string | null }[] = [];
    const now = this.clock.now();
    for (const r of rows) {
      if (r.action === 'ERROR' || r.action === 'SKIP') {
        report.push({ line: r.line, email: r.email, result: r.action === 'ERROR' ? 'SKIPPED_ERROR' : 'SKIPPED_EXISTS' });
        continue;
      }
      try {
        let userId = r.existingUserId ?? null;
        let activationUrl: string | null = null;
        let tempPassword: string | null = null;
        if (r.action === 'CREATE') {
          const created = await this.users.createUser(
            { email: r.email, name: r.name, role: r.role, universityId: r.universityId, facultyNumber: r.facultyNumber, programme: r.programme, year: r.year, group: r.group, department: r.department },
            actor,
            meta,
          );
          userId = created.user.id;
          activationUrl = created.activationUrl;
          tempPassword = created.tempPassword;
          if (opts.sendInvites) await this.users.deliverOnboarding(created.user, activationUrl, tempPassword);
        }
        const course = r.courseCode ? courses.find((c) => c.code === r.courseCode) : null;
        if (course && userId && r.role === 'STUDENT') {
          const active = await this.prisma.enrollment.findFirst({ where: { courseId: course.id, studentId: userId, state: 'ACTIVE' } });
          if (!active) await this.prisma.enrollment.create({ data: { courseId: course.id, studentId: userId, validFrom: now } });
        }
        report.push({ line: r.line, email: r.email, result: r.action === 'CREATE' ? 'CREATED' : 'ENROLLED', activationUrl, tempPassword });
      } catch (e: any) {
        report.push({ line: r.line, email: r.email, result: 'FAILED', message: e?.message ?? 'Error' });
      }
    }
    const counts = report.reduce<Record<string, number>>((a, r) => ((a[r.result] = (a[r.result] ?? 0) + 1), a), {});
    // Secrets are returned once to the admin and never stored in the batch report.
    await this.prisma.importBatch.update({
      where: { id: batchId },
      data: { status: 'COMMITTED', committedAt: now, report: report.map(({ activationUrl, tempPassword, ...rest }) => rest) as any },
    });
    await this.audit.log({ actor, action: 'users.imported', targetType: 'import_batch', targetId: batchId, metadata: { fileName: batch.fileName, ...counts }, ip: meta.ip, requestId: meta.requestId });
    return { batchId, counts, report };
  }

  async list() {
    const items = await this.prisma.importBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, fileName: true, status: true, summary: true, createdAt: true, committedAt: true, report: true },
    });
    return { items: items.map(({ report, ...b }) => ({ ...b, counts: Array.isArray(report) ? (report as any[]).reduce((a, r) => ((a[r.result] = (a[r.result] ?? 0) + 1), a), {}) : null })) };
  }

  template(kind: 'csv') {
    void kind;
    return 'email,name,role,faculty_number,university_id,programme,year,group,department,course_code\n' +
      'ayse.yilmaz@pau.edu.tr,Ayşe Yılmaz,STUDENT,20231001,,Computer Engineering,3,A,,CENG301\n' +
      'mehmet.kaya@pau.edu.tr,Mehmet Kaya,TEACHER,,T-0042,,,,Computer Engineering,\n';
  }
}
