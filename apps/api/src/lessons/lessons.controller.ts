import { Body, Controller, Get, Header, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, ReqMeta, RequestMeta, Roles } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import type { AuthUser } from '../common/auth-user';
import { IdempotencyService } from '../common/idempotency.service';
import { LessonsService } from './lessons.service';
import { AttendanceService } from '../attendance/attendance.service';

const lessonSchema = z.object({
  courseId: z.string().uuid(),
  startsAt: z.coerce.date(),
  scheduledEndAt: z.coerce.date(),
  title: z.string().trim().max(200).optional().nullable(),
  room: z.string().trim().max(60).optional().nullable(),
});
const startNowSchema = z.object({ durationMinutes: z.number().int().min(10).max(600).default(90), title: z.string().max(200).optional().nullable(), room: z.string().max(60).optional().nullable() });
const patchSchema = z.object({
  startsAt: z.coerce.date().optional(),
  scheduledEndAt: z.coerce.date().optional(),
  title: z.string().trim().max(200).optional().nullable(),
  room: z.string().trim().max(60).optional().nullable(),
  reason: z.string().trim().max(500).optional(),
});
const challengeSchema = z.object({ joinToken: z.string().min(10).max(100) });
const verifySchema = z.object({ challengeId: z.string().uuid(), markerFamily: z.string().max(20), markerId: z.number().int().min(0).max(10_000) });
const correctionSchema = z.object({
  status: z.enum(['PRESENT', 'LATE', 'MANUAL_PRESENT', 'MANUAL_LATE', 'ABSENT', 'EXCUSED', 'REMOVED_FROM_SESSION']),
  reason: z.string().trim().min(3, 'Reason is required').max(500),
});
const reasonSchema = z.object({ reason: z.string().trim().min(3, 'Reason is required').max(500) });
const manualCheckinSchema = z.object({ joinToken: z.string().min(10).max(100), reason: z.string().trim().min(3).max(500) });

@ApiTags('lessons')
@Controller()
export class LessonsController {
  constructor(
    private readonly lessons: LessonsService,
    private readonly attendance: AttendanceService,
    private readonly idem: IdempotencyService,
  ) {}

  @Get('lessons')
  list(@CurrentUser() user: AuthUser, @Query('courseId') courseId?: string, @Query('from') from?: string, @Query('to') to?: string, @Query('status') status?: string) {
    return this.lessons.list(user, { courseId, from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined, status });
  }

  @Roles('ADMIN', 'TEACHER')
  @Post('lessons')
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(lessonSchema)) body: z.infer<typeof lessonSchema>, @ReqMeta() meta: RequestMeta) {
    return this.lessons.create(user, body, meta);
  }

  @Roles('ADMIN', 'TEACHER')
  @Post('courses/:courseId/lessons')
  createForCourse(@CurrentUser() user: AuthUser, @Param('courseId', ParseUUIDPipe) courseId: string, @Body(new ZodPipe(lessonSchema.omit({ courseId: true }))) body: any, @ReqMeta() meta: RequestMeta) {
    return this.lessons.create(user, { ...body, courseId }, meta);
  }

  @Roles('ADMIN', 'TEACHER')
  @HttpCode(200)
  @Post('courses/:courseId/lessons/start-now')
  startNow(@CurrentUser() user: AuthUser, @Param('courseId', ParseUUIDPipe) courseId: string, @Body(new ZodPipe(startNowSchema)) body: z.infer<typeof startNowSchema>, @Headers('idempotency-key') key: string, @ReqMeta() meta: RequestMeta) {
    return this.idem.run(user.id, `start-now:${courseId}`, key, body, () => this.lessons.startNow(user, courseId, body, meta));
  }

  @Get('lessons/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.lessons.get(user, id);
  }

  @Roles('ADMIN', 'TEACHER')
  @Patch('lessons/:id')
  patch(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(patchSchema)) body: z.infer<typeof patchSchema>, @ReqMeta() meta: RequestMeta) {
    return this.lessons.reschedule(user, id, body, meta);
  }

  @Roles('ADMIN', 'TEACHER')
  @HttpCode(200)
  @Post('lessons/:id/start')
  start(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Headers('idempotency-key') key: string, @ReqMeta() meta: RequestMeta) {
    return this.idem.run(user.id, `start:${id}`, key, {}, () => this.lessons.start(user, id, meta));
  }

  @Roles('ADMIN', 'TEACHER')
  @HttpCode(200)
  @Post(['lessons/:id/end', 'lessons/:id/stop'])
  end(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.lessons.end(user, id, meta);
  }

  @Roles('ADMIN', 'TEACHER')
  @HttpCode(200)
  @Post('lessons/:id/lock')
  lock(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.lessons.lock(user, id, meta);
  }

  @Roles('ADMIN', 'TEACHER')
  @HttpCode(200)
  @Post('lessons/:id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(reasonSchema)) body: { reason: string }, @ReqMeta() meta: RequestMeta) {
    return this.lessons.cancel(user, id, body.reason, meta);
  }

  @Roles('ADMIN', 'TEACHER')
  @Header('Cache-Control', 'no-store')
  @Get('lessons/:id/display-state')
  displayState(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.lessons.displayState(user, id);
  }

  @Roles('ADMIN', 'TEACHER')
  @Get('lessons/:id/attendance')
  roster(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.attendance.roster(user, id);
  }

  @Roles('ADMIN', 'TEACHER')
  @Patch('lessons/:id/attendance/:studentId')
  correct(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('studentId', ParseUUIDPipe) studentId: string, @Body(new ZodPipe(correctionSchema)) body: z.infer<typeof correctionSchema>, @ReqMeta() meta: RequestMeta) {
    return this.attendance.correct(user, id, studentId, body, meta);
  }

  /** Legacy/alias route from spec section 8 */
  @Roles('ADMIN', 'TEACHER')
  @HttpCode(200)
  @Post(['lessons/:id/attendance/:studentId/remove', 'sessions/:id/attendance/:studentId/remove'])
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('studentId', ParseUUIDPipe) studentId: string, @Body(new ZodPipe(reasonSchema)) body: { reason: string }, @ReqMeta() meta: RequestMeta) {
    return this.attendance.correct(user, id, studentId, { status: 'REMOVED_FROM_SESSION', reason: body.reason }, meta);
  }

  @Roles('ADMIN', 'TEACHER')
  @Get('lessons/:id/attendance/:studentId/history')
  history(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.attendance.history(user, id, studentId);
  }

  // ---------------------------------------------------------------- student
  @Roles('STUDENT', 'TEACHER', 'ADMIN')
  @Header('Cache-Control', 'no-store')
  @Get('join/:token/context')
  joinContext(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    return this.attendance.joinContext(user, token);
  }

  @Roles('STUDENT')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('lessons/:id/attendance-challenges')
  challenge(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(challengeSchema)) body: { joinToken: string }, @ReqMeta() meta: RequestMeta) {
    return this.attendance.createChallenge(user, id, body.joinToken, meta);
  }

  @Roles('STUDENT')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  @Post(['lessons/:id/attendance/verify', 'lessons/:id/attendance-verifications'])
  verify(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(verifySchema)) body: z.infer<typeof verifySchema>, @Headers('idempotency-key') key: string, @ReqMeta() meta: RequestMeta) {
    return this.idem.run(user.id, `verify:${id}`, key, body, () => this.attendance.verify(user, id, body, meta));
  }

  @Roles('STUDENT')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('lessons/:id/manual-checkin-requests')
  manualCheckin(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(manualCheckinSchema)) body: z.infer<typeof manualCheckinSchema>, @ReqMeta() meta: RequestMeta) {
    return this.attendance.requestManualCheckin(user, id, body.joinToken, body.reason, meta);
  }
}
