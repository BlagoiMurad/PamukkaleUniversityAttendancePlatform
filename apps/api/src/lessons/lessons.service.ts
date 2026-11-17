import { Injectable, Logger } from '@nestjs/common';
import { Lesson, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { ClockService } from '../common/clock.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AppError } from '../common/errors';
import { randomToken } from '../common/util';
import type { AuthUser } from '../common/auth-user';
import type { RequestMeta } from '../common/decorators';
import { markerFor, slotBounds, slotIndex, TAG_FAMILY } from './markers';

export const PUBLIC_LESSON_SELECT = {
  id: true,
  courseId: true,
  teacherId: true,
  title: true,
  room: true,
  startsAt: true,
  scheduledEndAt: true,
  actualStartedAt: true,
  endedAt: true,
  lockedAt: true,
  status: true,
  markerRotationSeconds: true,
  attendancePolicyVersion: true,
  lateAfterSeconds: true,
  checkinCloseAfterSeconds: true,
  endReason: true,
  createdAt: true,
} satisfies Prisma.LessonSelect;

/** Lesson lifecycle DRAFT → ACTIVE → ENDED → LOCKED (spec 4.4), plus CANCELLED for DRAFT lessons. */
@Injectable()
export class LessonsService {
  private readonly logger = new Logger('Lessons');

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly clock: ClockService,
    private readonly realtime: RealtimeService,
  ) {}

  joinUrl(token: string) {
    return `${process.env.PUBLIC_WEB_URL ?? ''}/join/${token}`;
  }

  async create(user: AuthUser, body: { courseId: string; startsAt: Date; scheduledEndAt: Date; title?: string | null; room?: string | null }, meta: RequestMeta) {
    await this.access.assertCourseStaff(user, body.courseId);
    if (body.scheduledEndAt <= body.startsAt) throw new AppError('VALIDATION_FAILED', 'End must be after start');
    const course = await this.prisma.course.findUniqueOrThrow({ where: { id: body.courseId } });
    if (course.status !== 'ACTIVE') throw new AppError('CONFLICT', 'Course is archived');
    const lesson = await this.prisma.lesson.create({
      data: {
        courseId: body.courseId,
        teacherId: user.role === 'TEACHER' ? user.id : course.ownerId,
        startsAt: body.startsAt,
        scheduledEndAt: body.scheduledEndAt,
        title: body.title ?? null,
        room: body.room ?? null,
      },
      select: PUBLIC_LESSON_SELECT,
    });
    await this.audit.log({ actor: user, action: 'lesson.created', targetType: 'lesson', targetId: lesson.id, ip: meta.ip });
    return lesson;
  }

  async list(user: AuthUser, f: { courseId?: string; from?: Date; to?: Date; status?: string }) {
    const where: Prisma.LessonWhereInput = {};
    if (f.courseId) where.courseId = f.courseId;
    if (f.from || f.to) where.startsAt = { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: f.to } : {}) };
    if (f.status) where.status = f.status as any;
    if (user.role === 'TEACHER') {
      const ids = await this.access.teacherCourseIds(user.id);
      where.courseId = f.courseId ? (ids.includes(f.courseId) ? f.courseId : '__none__') : { in: ids };
      if (where.courseId === '__none__') throw new AppError('FORBIDDEN');
    } else if (user.role === 'STUDENT') {
      where.course = { enrollments: { some: { studentId: user.id } } };
    }
    const lessons = await this.prisma.lesson.findMany({
      where,
      select: {
        ...PUBLIC_LESSON_SELECT,
        course: { select: { id: true, code: true, title: true } },
        teacher: { select: { id: true, name: true } },
        _count: { select: { attendances: { where: { status: { in: ['PRESENT', 'LATE', 'MANUAL_PRESENT', 'MANUAL_LATE'] } } } } },
      },
      orderBy: { startsAt: f.from ? 'asc' : 'desc' },
      take: 300,
    });
    return { items: lessons.map(({ _count, ...l }) => ({ ...l, presentCount: _count.attendances })) };
  }

  async get(user: AuthUser, id: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      select: {
        ...PUBLIC_LESSON_SELECT,
        course: { select: { id: true, code: true, title: true, term: true } },
        teacher: { select: { id: true, name: true } },
      },
    });
    if (!lesson) throw new AppError('LESSON_NOT_FOUND');
    if (user.role === 'STUDENT') {
      const e = await this.prisma.enrollment.count({ where: { courseId: lesson.courseId, studentId: user.id } });
      if (!e) throw new AppError('FORBIDDEN');
    } else {
      await this.access.assertCourseStaff(user, lesson.courseId);
    }
    return lesson;
  }

  async start(user: AuthUser, id: string, meta: RequestMeta) {
    const lesson = await this.access.assertLessonStaff(user, id);
    if (lesson.status === 'ACTIVE') return this.get(user, id); // idempotent double start (spec 9)
    if (lesson.status !== 'DRAFT') throw new AppError('INVALID_TRANSITION', `A ${lesson.status.toLowerCase()} lesson cannot be restarted`);
    const policy = await this.settings.currentPolicy();
    const now = this.clock.now();
    try {
      const updated = await this.prisma.lesson.updateMany({
        where: { id, status: 'DRAFT' },
        data: {
          status: 'ACTIVE',
          actualStartedAt: now,
          markerEpoch: now,
          sessionSecret: randomToken(32),
          joinToken: randomToken(18),
          attendancePolicyVersion: policy.version,
          lateAfterSeconds: policy.lateAfterSeconds,
          checkinCloseAfterSeconds: policy.checkinCloseAfterSeconds,
          graceMs: policy.graceMs,
        },
      });
      if (!updated.count) throw new AppError('INVALID_TRANSITION', 'Lesson state changed, reload');
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new AppError('LESSON_ALREADY_ACTIVE', 'Another lesson of this course is already running. End it first.');
      }
      throw e;
    }
    await this.audit.log({ actor: user, action: 'lesson.started', targetType: 'lesson', targetId: id, metadata: { policyVersion: policy.version }, ip: meta.ip, requestId: meta.requestId });
    const result = await this.get(user, id);
    this.realtime.toLessonStaff(id, 'session.started', { lessonId: id });
    return result;
  }

  /** Creates and immediately starts a lesson ("Start lesson now"). */
  async startNow(user: AuthUser, courseId: string, body: { durationMinutes: number; title?: string | null; room?: string | null }, meta: RequestMeta) {
    const active = await this.prisma.lesson.findFirst({ where: { courseId, status: 'ACTIVE' } });
    if (active) {
      await this.access.assertCourseStaff(user, courseId);
      return this.get(user, active.id);
    }
    const now = this.clock.now();
    const lesson = await this.create(user, { courseId, startsAt: now, scheduledEndAt: new Date(now.getTime() + body.durationMinutes * 60_000), title: body.title, room: body.room }, meta);
    return this.start(user, lesson.id, meta);
  }

  async end(actor: AuthUser | null, id: string, meta: RequestMeta, reason = 'ENDED_BY_TEACHER') {
    const lesson = actor ? await this.access.assertLessonStaff(actor, id) : await this.prisma.lesson.findUniqueOrThrow({ where: { id } });
    if (lesson.status === 'ENDED' || lesson.status === 'LOCKED') return this.summary(id);
    if (lesson.status !== 'ACTIVE') throw new AppError('INVALID_TRANSITION', 'Only an active lesson can be ended');
    const now = this.clock.now();
    const absentees = await this.prisma.$transaction(async (tx) => {
      const r = await tx.lesson.updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'ENDED', endedAt: now, endReason: reason } });
      if (!r.count) return 0;
      // Join URL and every open challenge become invalid immediately (spec 16.2, 18.4)
      await tx.attendanceChallenge.updateMany({ where: { lessonId: id, status: 'ACTIVE' }, data: { status: 'REVOKED' } });
      return this.createAbsences(tx, lesson, now, actor?.id ?? null);
    });
    await this.audit.log({ actor, action: 'lesson.ended', targetType: 'lesson', targetId: id, metadata: { reason, absentees }, ip: meta.ip, requestId: meta.requestId });
    this.realtime.toLessonStaff(id, 'session.ended', { lessonId: id });
    this.realtime.toLessonStudents(id, 'lesson.ended', { lessonId: id });
    return this.summary(id);
  }

  /** ABSENT rows are produced when the lesson ends, for students enrolled at the lesson start (spec 4.4). */
  private async createAbsences(tx: Prisma.TransactionClient, lesson: Lesson, now: Date, actorId: string | null) {
    const at = lesson.actualStartedAt ?? lesson.startsAt;
    const enrolled = await tx.enrollment.findMany({
      where: { courseId: lesson.courseId, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: at } }] },
      select: { studentId: true },
    });
    const existing = await tx.attendance.findMany({ where: { lessonId: lesson.id }, select: { studentId: true } });
    const have = new Set(existing.map((e) => e.studentId));
    const missing = [...new Set(enrolled.map((e) => e.studentId))].filter((s) => !have.has(s));
    for (const studentId of missing) {
      const a = await tx.attendance.create({
        data: { lessonId: lesson.id, studentId, status: 'ABSENT', evidenceType: 'SYSTEM', policyVersion: lesson.attendancePolicyVersion },
      });
      await tx.attendanceEvent.create({ data: { attendanceId: a.id, actorId, action: 'ABSENT_ON_END', newStatus: 'ABSENT' } });
    }
    return missing.length;
  }

  async lock(user: AuthUser | null, id: string, meta: RequestMeta) {
    const lesson = user ? await this.access.assertLessonStaff(user, id) : await this.prisma.lesson.findUniqueOrThrow({ where: { id } });
    if (lesson.status === 'LOCKED') return { ok: true };
    if (lesson.status !== 'ENDED') throw new AppError('INVALID_TRANSITION', 'Only an ended lesson can be locked');
    await this.prisma.lesson.update({ where: { id }, data: { status: 'LOCKED', lockedAt: this.clock.now() } });
    await this.audit.log({ actor: user, action: 'lesson.locked', targetType: 'lesson', targetId: id, ip: meta.ip });
    return { ok: true };
  }

  async cancel(user: AuthUser, id: string, reason: string, meta: RequestMeta) {
    const lesson = await this.access.assertLessonStaff(user, id);
    if (lesson.status !== 'DRAFT') throw new AppError('INVALID_TRANSITION', 'Only a lesson that has not started can be cancelled');
    await this.prisma.lesson.update({ where: { id }, data: { status: 'CANCELLED', endReason: reason } });
    await this.audit.log({ actor: user, action: 'lesson.cancelled', targetType: 'lesson', targetId: id, reason, ip: meta.ip });
    return { ok: true };
  }

  /** Planned time can only change before start; afterwards only an audited admin correction (spec 4.4). */
  async reschedule(user: AuthUser, id: string, body: { startsAt?: Date; scheduledEndAt?: Date; title?: string | null; room?: string | null; reason?: string }, meta: RequestMeta) {
    const lesson = await this.access.assertLessonStaff(user, id);
    const timeChange = body.startsAt || body.scheduledEndAt;
    if (timeChange && lesson.status !== 'DRAFT') {
      if (user.role !== 'ADMIN') throw new AppError('FORBIDDEN', 'The start time cannot be changed after the lesson has started');
      if (!body.reason || body.reason.trim().length < 3) throw new AppError('REASON_REQUIRED', 'A reason is required');
    }
    const startsAt = body.startsAt ?? lesson.startsAt;
    const scheduledEndAt = body.scheduledEndAt ?? lesson.scheduledEndAt;
    if (scheduledEndAt <= startsAt) throw new AppError('VALIDATION_FAILED', 'End must be after start');
    await this.prisma.lesson.update({ where: { id }, data: { startsAt, scheduledEndAt, title: body.title ?? lesson.title, room: body.room ?? lesson.room } });
    await this.audit.log({
      actor: user,
      action: timeChange && lesson.status !== 'DRAFT' ? 'lesson.admin_time_correction' : 'lesson.updated',
      targetType: 'lesson',
      targetId: id,
      reason: body.reason,
      metadata: { from: { startsAt: lesson.startsAt, scheduledEndAt: lesson.scheduledEndAt }, to: { startsAt, scheduledEndAt } },
      ip: meta.ip,
    });
    return this.get(user, id);
  }

  /** Projector state (spec 16.5 display-state). Only for authorised staff, never cached. */
  async displayState(user: AuthUser, id: string) {
    const lesson = await this.access.assertLessonStaff(user, id);
    const course = await this.prisma.course.findUniqueOrThrow({ where: { id: lesson.courseId }, select: { code: true, title: true } });
    return this.computeDisplayState(lesson, course);
  }

  computeDisplayState(lesson: Lesson, course: { code: string; title: string }) {
    const now = this.clock.nowMs();
    const base = {
      lessonId: lesson.id,
      status: lesson.status,
      course,
      title: lesson.title,
      room: lesson.room,
      startsAt: lesson.startsAt,
      actualStartedAt: lesson.actualStartedAt,
      lateAfterSeconds: lesson.lateAfterSeconds,
      serverNow: new Date(now).toISOString(),
      rotationSeconds: lesson.markerRotationSeconds,
    };
    if (lesson.status !== 'ACTIVE' || !lesson.markerEpoch || !lesson.sessionSecret || !lesson.joinToken) {
      return { ...base, joinUrl: null, marker: null, slotStartAt: null, slotEndAt: null };
    }
    const epoch = lesson.markerEpoch.getTime();
    const slot = slotIndex(epoch, now, lesson.markerRotationSeconds);
    const { start, end } = slotBounds(epoch, slot, lesson.markerRotationSeconds);
    return {
      ...base,
      joinUrl: this.joinUrl(lesson.joinToken),
      marker: { family: TAG_FAMILY, id: markerFor(lesson.sessionSecret, lesson.id, slot), slot },
      slotStartAt: new Date(start).toISOString(),
      slotEndAt: new Date(end).toISOString(),
    };
  }

  async summary(id: string) {
    const lesson = await this.prisma.lesson.findUniqueOrThrow({ where: { id }, select: PUBLIC_LESSON_SELECT });
    const groups = await this.prisma.attendance.groupBy({ by: ['status'], where: { lessonId: id }, _count: true });
    return { ...lesson, counts: Object.fromEntries(groups.map((g) => [g.status, g._count])) };
  }

  // ------------------------------------------------------------------ background rules
  /** Auto-end lessons past their scheduled end (+grace) and auto-lock old ended lessons. */
  async runLifecycleJobs() {
    const s = await this.settings.get();
    const now = this.clock.nowMs();
    if (s.autoEndAfterScheduledMinutes > 0) {
      const overdue = await this.prisma.lesson.findMany({
        where: { status: 'ACTIVE', scheduledEndAt: { lt: new Date(now - s.autoEndAfterScheduledMinutes * 60_000) } },
        select: { id: true },
      });
      for (const l of overdue) {
        await this.end(null, l.id, {}, 'AUTO_ENDED').catch((e) => this.logger.warn(`auto-end ${l.id}: ${e.message}`));
      }
    }
    if (s.lockAfterHours > 0) {
      const old = await this.prisma.lesson.findMany({ where: { status: 'ENDED', endedAt: { lt: new Date(now - s.lockAfterHours * 3600_000) } }, select: { id: true } });
      for (const l of old) await this.lock(null, l.id, {}).catch(() => undefined);
    }
  }
}
