import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { DeviceService } from './device.service';
import { CurrentUser, ReqMeta, RequestMeta, Roles } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors';
import type { AuthUser } from '../common/auth-user';

const reviewSchema = z.object({ note: z.string().trim().max(500).optional() });
const statusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']);

/** Device change requests: students raise them when locked out, staff decide. */
@ApiTags('devices')
@Roles('ADMIN', 'TEACHER')
@Controller('device-requests')
export class DeviceController {
  constructor(
    private readonly devices: DeviceService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  list(@Query('status') status?: string) {
    const parsed = status ? statusSchema.safeParse(status) : null;
    return this.devices.listRequests(parsed?.success ? parsed.data : undefined);
  }

  @HttpCode(200)
  @Post(':id/approve')
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(reviewSchema)) body: z.infer<typeof reviewSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.devices.review(id, true, await this.reviewer(user.id), body.note, meta);
  }

  @HttpCode(200)
  @Post(':id/reject')
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(reviewSchema)) body: z.infer<typeof reviewSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.devices.review(id, false, await this.reviewer(user.id), body.note, meta);
  }

  private async reviewer(id: string) {
    const row = await this.prisma.user.findUnique({ where: { id } });
    if (!row) throw new AppError('NOT_FOUND', 'Reviewer not found');
    return row;
  }
}
