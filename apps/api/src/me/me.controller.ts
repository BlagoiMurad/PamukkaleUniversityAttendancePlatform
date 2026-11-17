import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AllowPendingPassword, CurrentUser, ReqMeta, RequestMeta } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import type { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { AttendanceService } from '../attendance/attendance.service';
import { publicUser } from '../auth/auth.service';

const meSchema = z.object({
  preferredName: z.string().trim().max(100).optional().nullable(),
  phone: z.string().trim().max(40).regex(/^[+0-9 ()-]*$/, 'Digits only').optional().nullable(),
  locale: z.enum(['en', 'bg', 'tr']).optional(),
});

@ApiTags('me')
@Controller('me')
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly attendance: AttendanceService,
  ) {}

  @AllowPendingPassword()
  @Get()
  async me(@CurrentUser() user: AuthUser) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { studentProfile: true, teacherProfile: true } });
    return { user: publicUser(u), sessionId: user.sessionId, settings: await this.settings.getPublic() };
  }

  /** Users edit only fields allowed by policy; e-mail, ID and courses are managed by staff (spec 18.3). */
  @Patch()
  async update(@CurrentUser() user: AuthUser, @Body(new ZodPipe(meSchema)) body: z.infer<typeof meSchema>, @ReqMeta() meta: RequestMeta) {
    const s = await this.settings.get();
    const allowed = user.role === 'STUDENT' ? s.studentEditableFields : ['preferredName', 'phone', 'locale'];
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) if (allowed.includes(k as any) && v !== undefined) data[k] = v;
    const u = await this.prisma.user.update({ where: { id: user.id }, data, include: { studentProfile: true, teacherProfile: true } });
    await this.audit.log({ actor: user, action: 'me.updated', targetType: 'user', targetId: user.id, metadata: { fields: Object.keys(data) }, ip: meta.ip });
    return { user: publicUser(u) };
  }

  @Get('attendance')
  myAttendance(@CurrentUser() user: AuthUser, @Query('courseId') courseId?: string) {
    return this.attendance.myAttendance(user, courseId);
  }
}
