import { Injectable } from '@nestjs/common';
import { AttendanceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuditService } from '../audit/audit.service';
import { ClockService } from '../common/clock.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AttendanceService } from '../attendance/attendance.service';
import { AppError } from '../common/errors';
import type { AuthUser } from '../common/auth-user';
import type { RequestMeta } from '../common/decorators';

/** Student disputes, manual check-in requests and (optionally) teacher corrections awaiting admin approval. */
@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
    private readonly realtime: RealtimeService,
    private readonly attendance: AttendanceService,
  ) {}

  async createDispute(user: AuthUser, attendanceId: string, body: { requestedStatus: AttendanceStatus; reason: string }, meta: RequestMeta) {
    const a = await this.prisma.attendance.findUnique({ where: { id: attendanceId }, include: { lesson: true } });
    if (!a || a.studentId !== user.id) throw new AppError('NOT_FOUND');
    const pending = await this.prisma.attendanceRequest.findFirst({ where: { attendanceId, status: 'PENDING', kind: 'STUDENT_DISPUTE' } });
    if (pending) throw new AppError('CONFLICT', 'A request for this lesson is already pending');
    const req = await this.prisma.attendanceRequest.create({
      data: { kind: 'STUDENT_DISPUTE', lessonId: a.lessonId, studentId: user.id, attendanceId, authorId: user.id, requestedStatus: body.requestedStatus, reason: body.reason },
    });
    await this.audit.log({ actor: user, action: 'request.dispute_created', targetType: 'attendance', targetId: attendanceId, reason: body.reason, ip: meta.ip });
    this.realtime.toLessonStaff(a.lessonId, 'request.created', { lessonId: a.lessonId, requestId: req.id });
    return req;
  }

  async list(user: AuthUser, f: { status?: string; kind?: string }) {
    const where: Prisma.AttendanceRequestWhereInput = {};
    if (f.status && ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(f.status)) where.status = f.status as any;
    if (f.kind && ['STUDENT_DISPUTE', 'MANUAL_CHECKIN', 'TEACHER_CORRECTION'].includes(f.kind)) where.kind = f.kind as any;
    if (user.role === 'STUDENT') where.studentId = user.id;
    if (user.role === 'TEACHER') where.lesson = { courseId: { in: await this.access.teacherCourseIds(user.id) } };
    const items = await this.prisma.attendanceRequest.findMany({
      where,
      include: {
        student: { select: { id: true, name: true, email: true, studentProfile: { select: { facultyNumber: true } } } },
        author: { select: { id: true, name: true, role: true } },
        reviewer: { select: { id: true, name: true } },
        attendance: { select: { status: true, verifiedAt: true } },
        lesson: { select: { id: true, title: true, startsAt: true, status: true, course: { select: { id: true, code: true, title: true } } } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 300,
    });
    return { items };
  }

  async review(user: AuthUser, id: string, decision: 'APPROVED' | 'REJECTED', note: string | undefined, meta: RequestMeta) {
    const req = await this.prisma.attendanceRequest.findUnique({ where: { id }, include: { lesson: true, student: { select: { name: true } } } });
    if (!req) throw new AppError('NOT_FOUND');
    if (user.role === 'STUDENT') throw new AppError('FORBIDDEN');
    await this.access.assertCourseStaff(user, req.lesson.courseId);
    if (req.kind === 'TEACHER_CORRECTION' && user.role !== 'ADMIN') throw new AppError('FORBIDDEN', 'Only administrators approve teacher corrections');
    if (req.status !== 'PENDING') throw new AppError('CONFLICT', 'This request was already handled');
    if (decision === 'APPROVED') {
      const status = req.requestedStatus ?? 'MANUAL_PRESENT';
      const reason = `${req.kind === 'STUDENT_DISPUTE' ? 'Dispute approved' : req.kind === 'MANUAL_CHECKIN' ? 'Manual check-in' : 'Correction approved'}: ${note || req.reason}`;
      await this.attendance.correct(user, req.lessonId, req.studentId, { status: status === 'PRESENT' ? 'MANUAL_PRESENT' : status === 'LATE' ? 'MANUAL_LATE' : status, reason }, meta, { viaApproval: true });
    }
    await this.prisma.attendanceRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: decision, reviewerId: user.id, reviewNote: note ?? null, reviewedAt: this.clock.now() },
    });
    await this.audit.log({ actor: user, action: `request.${decision.toLowerCase()}`, targetType: 'attendance_request', targetId: id, reason: note, metadata: { kind: req.kind }, ip: meta.ip });
    this.realtime.toUser(req.studentId, 'request.updated', { id, status: decision });
    return { ok: true };
  }

  async cancel(user: AuthUser, id: string) {
    const r = await this.prisma.attendanceRequest.updateMany({ where: { id, authorId: user.id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    if (!r.count) throw new AppError('NOT_FOUND');
    return { ok: true };
  }
}
