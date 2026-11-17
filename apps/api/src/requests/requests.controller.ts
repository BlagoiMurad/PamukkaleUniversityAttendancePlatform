import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, ReqMeta, RequestMeta, Roles } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import type { AuthUser } from '../common/auth-user';
import { RequestsService } from './requests.service';

const disputeSchema = z.object({ requestedStatus: z.enum(['PRESENT', 'LATE', 'EXCUSED']), reason: z.string().trim().min(3).max(500) });
const reviewSchema = z.object({ note: z.string().trim().max(500).optional() });

@ApiTags('requests')
@Controller()
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Roles('STUDENT')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(['attendance/:id/disputes', 'me/attendance-disputes/:id'])
  dispute(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(disputeSchema)) body: z.infer<typeof disputeSchema>, @ReqMeta() meta: RequestMeta) {
    return this.requests.createDispute(user, id, body, meta);
  }

  @Get('requests')
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string, @Query('kind') kind?: string) {
    return this.requests.list(user, { status, kind });
  }

  @Roles('TEACHER', 'ADMIN')
  @HttpCode(200)
  @Post('requests/:id/approve')
  approve(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(reviewSchema)) body: { note?: string }, @ReqMeta() meta: RequestMeta) {
    return this.requests.review(user, id, 'APPROVED', body.note, meta);
  }

  @Roles('TEACHER', 'ADMIN')
  @HttpCode(200)
  @Post('requests/:id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(reviewSchema)) body: { note?: string }, @ReqMeta() meta: RequestMeta) {
    return this.requests.review(user, id, 'REJECTED', body.note, meta);
  }

  @HttpCode(200)
  @Post('requests/:id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.requests.cancel(user, id);
  }
}
