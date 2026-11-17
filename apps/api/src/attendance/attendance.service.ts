import { Injectable } from '@nestjs/common';
import { AttendanceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { ClockService } from '../common/clock.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AppError } from '../common/errors';
import { randomToken, sha256 } from '../common/util';
import type { AuthUser } from '../common/auth-user';
import type { RequestMeta } from '../common/decorators';
import { checkMarker, lateness, TAG_FAMILY } from '../lessons/markers';

export const COUNTED_PRESENT: AttendanceStatus[] = ['PRESENT', 'LATE', 'MANUAL_PRESENT', 'MANUAL_LATE'];
const MANUAL_STATUSES: AttendanceStatus[] = ['MANUAL_PRESENT', 'MANUAL_LATE', 'ABSENT', 'EXCUSED', 'PRESENT', 'LATE'];

const attendanceView = (a: any) => ({
  id: a.id,
  lessonId: a.lessonId,
  studentId: a.studentId,
  status: a.status,
  verifiedAt: a.verifiedAt,
  latenessSeconds: a.latenessSeconds,
  evidenceType: a.evidenceType,
  manuallyCorrected: a.manuallyCorrected,
  updatedAt: a.updatedAt,
});

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly clock: ClockService,
    private readonly realtime: RealtimeService,
  ) {}

  // ------------------------------------------------------------------ student flow (spec 18.2)
  /** GET /join/:token/context — validates the QR link for the signed-in student. Never records attendance. */
  async joinContext(user: AuthUser, joinToken: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { joinToken },
      include: { course: { select: { id: true, code: true, title: true } }, teacher: { select: { name: true } } },
    });
    if (!lesson) throw new AppError('JOIN_TOKEN_INVALID', 'This lesson link is not valid');
    const base = {
      lesson: {
        id: lesson.id,
        title: lesson.title,
        room: lesson.room,
        status: lesson.status,
        startsAt: lesson.startsAt,
        actualStartedAt: lesson.actualStartedAt,
        lateAfterSeconds: lesson.lateAfterSeconds,
        checkinCloseAfterSeconds: lesson.checkinCloseAfterSeconds,
        rotationSeconds: lesson.markerRotationSeconds,
      },
      course: lesson.course,
      teacher: lesson.teacher,
      serverNow: this.clock.now().toISOString(),
    };
    if (user.role !== 'STUDENT') return { ...base, canCheckIn: false, reason: 'NOT_A_STUDENT', attendance: null };
    const attendance = await this.prisma.attendance.findUnique({ where: { lessonId_studentId: { lessonId: lesson.id, studentId: user.id } } });
    const reason = await this.blockingReason(user.id, lesson);
    const settings = await this.settings.get();
    const pendingManual = await this.prisma.attendanceRequest.findFirst({
      where: { lessonId: lesson.id, studentId: user.id, kind: 'MANUAL_CHECKIN', status: 'PENDING' },
      select: { id: true, createdAt: true },
    });
    return {
      ...base,
      canCheckIn: !reason && !attendance,
      reason: attendance ? (attendance.status === 'REMOVED_FROM_SESSION' ? 'STUDENT_REMOVED' : 'ALREADY_RECORDED') : reason,
      attendance: attendance ? attendanceView(attendance) : null,
      manualCheckin: { allowed: settings.allowManualCheckinRequests, pending: pendingManual },
    };
  }

  private async blockingReason(studentId: string, lesson: { id: string; courseId: string; status: string; actualStartedAt: Date | null; checkinCloseAfterSeconds: number | null }) {
    if (lesson.status === 'DRAFT') return 'LESSON_NOT_STARTED';
    if (lesson.status !== 'ACTIVE') return 'LESSON_ENDED';
    const enrollment = await this.prisma.enrollment.findFirst({ where: { courseId: lesson.courseId, studentId }, orderBy: { validFrom: 'desc' } });
    if (!enrollment) return 'STUDENT_NOT_ENROLLED';
    if (enrollment.state !== 'ACTIVE') return 'ENROLLMENT_REVOKED';
    if (lesson.checkinCloseAfterSeconds && lesson.actualStartedAt && this.clock.nowMs() > lesson.actualStartedAt.getTime() + lesson.checkinCloseAfterSeconds * 1000) {
      return 'CHECKIN_CLOSED';
    }
    return null;
  }

  /** POST /lessons/:id/attendance-challenges — personal one-time challenge bound to user + lesson + device session. */
  async createChallenge(user: AuthUser, lessonId: string, joinToken: string, meta: RequestMeta) {
    if (user.role !== 'STUDENT') throw new AppError('FORBIDDEN', 'Only students check in');
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson || !lesson.joinToken || lesson.joinToken !== joinToken) throw new AppError('JOIN_TOKEN_INVALID', 'Open the lesson link from the projector again');
    const reason = await this.blockingReason(user.id, lesson);
    if (reason) throw new AppError(reason as any);
    const existing = await this.prisma.attendance.findUnique({ where: { lessonId_studentId: { lessonId, studentId: user.id } } });
    if (existing?.status === 'REMOVED_FROM_SESSION') throw new AppError('STUDENT_REMOVED', 'You were removed from this lesson by the teacher');
    if (existing) return { alreadyRecorded: true, attendance: attendanceView(existing) };

    const settings = await this.settings.get();
    const now = this.clock.nowMs();
    const nonce = randomToken(16);
    const challenge = await this.prisma.$transaction(async (tx) => {
      // Only one live challenge per student+lesson
      await tx.attendanceChallenge.updateMany({ where: { lessonId, userId: user.id, status: 'ACTIVE' }, data: { status: 'REVOKED' } });
      return tx.attendanceChallenge.create({
        data: {
          lessonId,
          userId: user.id,
          deviceSessionId: user.sessionId,
          nonceHash: sha256(nonce),
          createdAt: new Date(now),
          expiresAt: new Date(now + settings.challengeTtlSeconds * 1000),
        },
      });
    });
    return { alreadyRecorded: false, challengeId: challenge.id, expiresAt: challenge.expiresAt, serverNow: new Date(now).toISOString(), markerFamily: TAG_FAMILY };
  }

  /**
   * POST /lessons/:id/attendance/verify — the only place a scan becomes attendance.
   * All checks use server time; the write is atomic and unique per (lesson, student) (spec 16.3, 19, EC-20-05).
   */
  async verify(user: AuthUser, lessonId: string, body: { challengeId: string; markerFamily: string; markerId: number }, meta: RequestMeta) {
    if (user.role !== 'STUDENT') throw new AppError('FORBIDDEN');
    if (body.markerFamily !== TAG_FAMILY) throw new AppError('MARKER_FAMILY_UNSUPPORTED', 'Only AprilTag tag36h11 is accepted');
    const nowMs = this.clock.nowMs();
    const now = new Date(nowMs);

    const challenge = await this.prisma.attendanceChallenge.findUnique({ where: { id: body.challengeId } });
    // Personal, non-transferable (EC-20-08)
    if (!challenge || challenge.userId !== user.id || challenge.lessonId !== lessonId) throw new AppError('CHALLENGE_NOT_FOUND', 'Start the scan again');
    // Bound to the device session; a new login elsewhere revokes it (EC-20-06)
    if (challenge.deviceSessionId !== user.sessionId) throw new AppError('SESSION_REVOKED', 'This scan belongs to another session');

    const existing = await this.prisma.attendance.findUnique({ where: { lessonId_studentId: { lessonId, studentId: user.id } } });
    if (existing) {
      if (existing.status === 'REMOVED_FROM_SESSION') throw new AppError('STUDENT_REMOVED', 'You were removed from this lesson by the teacher');
      return { status: existing.status, verifiedAt: existing.verifiedAt, attendanceId: existing.id, alreadyRecorded: true, latenessSeconds: existing.latenessSeconds };
    }
    if (challenge.status === 'CONSUMED') throw new AppError('CHALLENGE_USED', 'This scan was already used');
    if (challenge.status === 'REVOKED') throw new AppError('CHALLENGE_REVOKED', 'This scan was cancelled');
    if (challenge.status === 'EXPIRED' || challenge.expiresAt.getTime() < nowMs) throw new AppError('CHALLENGE_EXPIRED', 'Scan expired, starting a new one');

    const lesson = await this.prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } });
    const reason = await this.blockingReason(user.id, lesson);
    if (reason) throw new AppError(reason as any);
    if (!lesson.sessionSecret || !lesson.markerEpoch || !lesson.actualStartedAt) throw new AppError('LESSON_NOT_ACTIVE');

    const settingsAttempts = (await this.settings.get()).challengeMaxAttempts;
    const bumped = await this.prisma.attendanceChallenge.updateMany({
      where: { id: challenge.id, status: 'ACTIVE', attempts: { lt: settingsAttempts } },
      data: { attempts: { increment: 1 } },
    });
    if (!bumped.count) throw new AppError('CHALLENGE_ATTEMPTS_EXCEEDED', 'Too many attempts, start a new scan');

    const marker = checkMarker({
      secret: lesson.sessionSecret,
      lessonId,
      epochMs: lesson.markerEpoch.getTime(),
      nowMs,
      markerId: body.markerId,
      graceMs: lesson.graceMs ?? 0,
      attemptStartedMs: challenge.createdAt.getTime(),
      rotationSeconds: lesson.markerRotationSeconds,
    });
    if (!marker.ok) throw new AppError(marker.code, marker.code === 'MARKER_EXPIRED' ? 'The marker changed, point the camera at the new one' : 'This is not the current marker');

    const { status, latenessSeconds } = lateness(lesson.actualStartedAt.getTime(), nowMs, lesson.lateAfterSeconds ?? 600);

    try {
      const attendance = await this.prisma.$transaction(async (tx) => {
        const consumed = await tx.attendanceChallenge.updateMany({
          where: { id: challenge.id, status: 'ACTIVE', consumedAt: null, expiresAt: { gte: now } },
          data: { status: 'CONSUMED', consumedAt: now },
        });
        if (consumed.count !== 1) throw new AppError('CHALLENGE_USED', 'This scan was already used');
        // Re-check the lesson & session inside the transaction (end mid-scan, revoked device)
        const live = await tx.lesson.findUnique({ where: { id: lessonId }, select: { status: true } });
        if (live?.status !== 'ACTIVE') throw new AppError('LESSON_ENDED', 'The lesson has ended');
        const session = await tx.deviceSession.findUnique({ where: { id: user.sessionId }, select: { revokedAt: true } });
        if (session?.revokedAt) throw new AppError('SESSION_REVOKED');
        const a = await tx.attendance.create({
          data: {
            lessonId,
            studentId: user.id,
            status,
            verifiedAt: now,
            latenessSeconds,
            evidenceType: 'APRILTAG',
            deviceSessionId: user.sessionId,
            policyVersion: lesson.attendancePolicyVersion,
            graceUsed: marker.graceUsed,
          },
        });
        await tx.attendanceEvent.create({
          data: { attendanceId: a.id, actorId: user.id, action: 'VERIFIED', newStatus: status, metadata: { slot: marker.slot, graceUsed: marker.graceUsed } },
        });
        return a;
      });
      if (marker.graceUsed) {
        await this.audit.log({ actor: user, action: 'attendance.grace_used', targetType: 'attendance', targetId: attendance.id, metadata: { slot: marker.slot }, requestId: meta.requestId });
      }
      await this.broadcast(lessonId, user.id);
      return { status: attendance.status, verifiedAt: attendance.verifiedAt, attendanceId: attendance.id, alreadyRecorded: false, latenessSeconds };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // A concurrent verify won the race: return the single stored result (EC-20-05)
        const a = await this.prisma.attendance.findUniqueOrThrow({ where: { lessonId_studentId: { lessonId, studentId: user.id } } });
        return { status: a.status, verifiedAt: a.verifiedAt, attendanceId: a.id, alreadyRecorded: true, latenessSeconds: a.latenessSeconds };
      }
      throw e;
    }
  }

  /** Student without a camera asks the teacher for a manual check (spec 6 accessibility, Q5). */
  async requestManualCheckin(user: AuthUser, lessonId: string, joinToken: string, reason: string, meta: RequestMeta) {
    if (user.role !== 'STUDENT') throw new AppError('FORBIDDEN');
    const settings = await this.settings.get();
    if (!settings.allowManualCheckinRequests) throw new AppError('FORBIDDEN', 'Manual check-in requests are disabled');
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson || lesson.joinToken !== joinToken) throw new AppError('JOIN_TOKEN_INVALID');
    const block = await this.blockingReason(user.id, lesson);
    if (block) throw new AppError(block as any);
    const pending = await this.prisma.attendanceRequest.findFirst({ where: { lessonId, studentId: user.id, kind: 'MANUAL_CHECKIN', status: 'PENDING' } });
    if (pending) return pending;
    const req = await this.prisma.attendanceRequest.create({
      data: { kind: 'MANUAL_CHECKIN', lessonId, studentId: user.id, authorId: user.id, requestedStatus: 'MANUAL_PRESENT', reason: reason.slice(0, 500) },
    });
    await this.audit.log({ actor: user, action: 'attendance.manual_checkin_requested', targetType: 'lesson', targetId: lessonId, ip: meta.ip });
    this.realtime.toLessonStaff(lessonId, 'request.created', { lessonId, requestId: req.id });
    return req;
  }

  // ------------------------------------------------------------------ teacher views
  /** Live roster: every enrolled student + their record (spec 6 "live attendance table"). */
  async roster(user: AuthUser, lessonId: string) {
    const lesson = await this.access.assertLessonStaff(user, lessonId);
    const at = lesson.actualStartedAt ?? lesson.startsAt;
    const [enrollments, records, requests] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { courseId: lesson.courseId, OR: [{ state: 'ACTIVE' }, { validTo: { gt: at } }] },
        include: { student: { select: { id: true, name: true, email: true, universityId: true, studentProfile: { select: { facultyNumber: true, group: true } } } } },
      }),
      this.prisma.attendance.findMany({ where: { lessonId }, include: { student: { select: { id: true, name: true, email: true, universityId: true, studentProfile: { select: { facultyNumber: true, group: true } } } } } }),
      this.prisma.attendanceRequest.findMany({ where: { lessonId, status: 'PENDING' }, select: { id: true, kind: true, studentId: true, reason: true, requestedStatus: true, createdAt: true } }),
    ]);
    const byStudent = new Map<string, any>();
    for (const e of enrollments) byStudent.set(e.studentId, { student: e.student, enrollmentState: e.state, attendance: null });
    for (const r of records) {
      const row = byStudent.get(r.studentId) ?? { student: r.student, enrollmentState: 'WITHDRAWN' };
      row.attendance = attendanceView(r);
      byStudent.set(r.studentId, row);
    }
    const rows = [...byStudent.values()]
      .map((r) => ({ ...r, pendingRequest: requests.find((q) => q.studentId === r.student.id) ?? null }))
      .sort((a, b) => a.student.name.localeCompare(b.student.name));
    const counts = { total: rows.length, present: 0, late: 0, absent: 0, removed: 0, excused: 0, pending: 0 };
    for (const r of rows) {
      const s = r.attendance?.status;
      if (s === 'PRESENT' || s === 'MANUAL_PRESENT') counts.present++;
      else if (s === 'LATE' || s === 'MANUAL_LATE') counts.late++;
      else if (s === 'REMOVED_FROM_SESSION') counts.removed++;
      else if (s === 'EXCUSED') counts.excused++;
      else if (s === 'ABSENT') counts.absent++;
      else counts.pending++;
    }
    return { lessonId, status: lesson.status, counts, rows };
  }

  /**
   * PATCH /lessons/:id/attendance/:studentId — manual correction with a mandatory reason (spec 4.4, 19.2).
   * History is never deleted: every change adds an AttendanceEvent and an audit entry.
   */
  async correct(user: AuthUser, lessonId: string, studentId: string, body: { status: AttendanceStatus; reason: string }, meta: RequestMeta, opts: { viaApproval?: boolean } = {}) {
    const lesson = await this.access.assertLessonStaff(user, lessonId);
    const reason = body.reason?.trim();
    if (!reason || reason.length < 3) throw new AppError('REASON_REQUIRED', 'Please give a reason for the correction');
    const settings = await this.settings.get();
    if (lesson.status === 'DRAFT' || lesson.status === 'CANCELLED') throw new AppError('LESSON_NOT_STARTED', 'The lesson has not started');
    if (lesson.status === 'LOCKED' && user.role !== 'ADMIN' && !settings.teacherCanEditAfterLock) {
      throw new AppError('LESSON_LOCKED', 'This lesson is locked. Ask an administrator to correct it.');
    }
    if (!MANUAL_STATUSES.includes(body.status) && body.status !== 'REMOVED_FROM_SESSION') throw new AppError('VALIDATION_FAILED', 'Unsupported status');
    const everEnrolled = await this.prisma.enrollment.count({ where: { courseId: lesson.courseId, studentId } });
    if (!everEnrolled) throw new AppError('STUDENT_NOT_ENROLLED', 'Student is not enrolled in this course');

    if (user.role === 'TEACHER' && settings.teacherCorrectionsNeedApproval && !opts.viaApproval) {
      const req = await this.prisma.attendanceRequest.create({
        data: { kind: 'TEACHER_CORRECTION', lessonId, studentId, authorId: user.id, requestedStatus: body.status, reason },
      });
      await this.audit.log({ actor: user, action: 'attendance.correction_requested', targetType: 'lesson', targetId: lessonId, reason, metadata: { studentId, status: body.status }, ip: meta.ip });
      return { pendingApproval: true, requestId: req.id };
    }

    const now = this.clock.now();
    const result = await this.prisma.$transaction(async (tx) => {
      const prev = await tx.attendance.findUnique({ where: { lessonId_studentId: { lessonId, studentId } } });
      if (prev?.status === body.status) return prev;
      const isManual = body.status !== 'REMOVED_FROM_SESSION';
      const data = {
        status: body.status,
        evidenceType: isManual ? ('MANUAL' as const) : prev?.evidenceType ?? ('MANUAL' as const),
        manuallyCorrected: true,
        lastReason: reason,
        verifiedAt: isManual && !prev?.verifiedAt && (body.status === 'MANUAL_PRESENT' || body.status === 'MANUAL_LATE') ? now : prev?.verifiedAt ?? null,
      };
      const a = prev
        ? await tx.attendance.update({ where: { id: prev.id }, data })
        : await tx.attendance.create({ data: { lessonId, studentId, policyVersion: lesson.attendancePolicyVersion, ...data } });
      await tx.attendanceEvent.create({
        data: {
          attendanceId: a.id,
          actorId: user.id,
          action: body.status === 'REMOVED_FROM_SESSION' ? 'REMOVED' : prev?.status === 'REMOVED_FROM_SESSION' ? 'READMITTED' : 'MANUAL_CORRECTION',
          oldStatus: prev?.status ?? null,
          newStatus: body.status,
          reason,
        },
      });
      if (body.status === 'REMOVED_FROM_SESSION') {
        // Cancel a scan in progress (T09)
        await tx.attendanceChallenge.updateMany({ where: { lessonId, userId: studentId, status: 'ACTIVE' }, data: { status: 'REVOKED' } });
      }
      if (body.status === 'MANUAL_PRESENT' || body.status === 'MANUAL_LATE') {
        await tx.attendanceRequest.updateMany({
          where: { lessonId, studentId, kind: 'MANUAL_CHECKIN', status: 'PENDING' },
          data: { status: 'APPROVED', reviewerId: user.id, reviewedAt: now, reviewNote: reason },
        });
      }
      await this.audit.log(
        {
          actor: user,
          action: body.status === 'REMOVED_FROM_SESSION' ? 'attendance.removed' : 'attendance.corrected',
          targetType: 'attendance',
          targetId: a.id,
          reason,
          metadata: { lessonId, studentId, from: prev?.status ?? null, to: body.status, lessonStatus: lesson.status },
          ip: meta.ip,
          requestId: meta.requestId,
        },
        tx,
      );
      return a;
    });
    await this.broadcast(lessonId, studentId);
    this.realtime.toUser(studentId, 'attendance.updated', { lessonId, status: result.status });
    return attendanceView(result);
  }

  async history(user: AuthUser, lessonId: string, studentId: string) {
    await this.access.assertLessonStaff(user, lessonId);
    const a = await this.prisma.attendance.findUnique({
      where: { lessonId_studentId: { lessonId, studentId } },
      include: { events: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { id: true, name: true, role: true } } } } },
    });
    return { attendance: a ? attendanceView(a) : null, events: a?.events ?? [] };
  }

  private async broadcast(lessonId: string, studentId: string) {
    const a = await this.prisma.attendance.findUnique({
      where: { lessonId_studentId: { lessonId, studentId } },
      include: { student: { select: { id: true, name: true } } },
    });
    if (!a) return;
    this.realtime.toLessonStaff(lessonId, 'attendance.updated', { lessonId, studentId, student: a.student, attendance: attendanceView(a) });
  }

  // ------------------------------------------------------------------ student self-service
  async myAttendance(user: AuthUser, courseId?: string) {
    const records = await this.prisma.attendance.findMany({
      where: { studentId: user.id, ...(courseId ? { lesson: { courseId } } : {}) },
      include: {
        lesson: { select: { id: true, title: true, startsAt: true, actualStartedAt: true, status: true, course: { select: { id: true, code: true, title: true } } } },
        requests: { where: { kind: 'STUDENT_DISPUTE' }, select: { id: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { lesson: { startsAt: 'desc' } },
      take: 500,
    });
    const stats = { total: 0, present: 0, late: 0, absent: 0, excused: 0 };
    for (const r of records) {
      if (r.status === 'REMOVED_FROM_SESSION') continue;
      stats.total++;
      if (r.status === 'PRESENT' || r.status === 'MANUAL_PRESENT') stats.present++;
      else if (r.status === 'LATE' || r.status === 'MANUAL_LATE') stats.late++;
      else if (r.status === 'EXCUSED') stats.excused++;
      else stats.absent++;
    }
    return {
      stats: { ...stats, rate: stats.total ? Math.round(((stats.present + stats.late) / stats.total) * 1000) / 10 : null },
      items: records.map((r) => ({ ...attendanceView(r), lesson: r.lesson, dispute: r.requests[0] ?? null })),
    };
  }
}
