import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, ReqMeta, RequestMeta, Roles } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import type { AuthUser } from '../common/auth-user';
import { SettingsService } from './settings.service';
import { DEFAULT_SETTINGS, settingsSchema } from './settings.defaults';
import { AuditService } from '../audit/audit.service';

@ApiTags('settings')
@Controller()
export class SettingsController {
  constructor(private readonly settings: SettingsService, private readonly audit: AuditService) {}

  @Public()
  @Get('settings/public')
  async publicSettings() {
    const s = await this.settings.get();
    return { universityName: s.universityName, universityTimeZone: s.universityTimeZone };
  }

  @Roles('ADMIN')
  @Get('admin/settings')
  async all() {
    return { settings: await this.settings.get(), defaults: DEFAULT_SETTINGS, policy: await this.settings.currentPolicy() };
  }

  @Roles('ADMIN')
  @Patch('admin/settings')
  async update(@CurrentUser() user: AuthUser, @Body(new ZodPipe(settingsSchema.partial())) body: any, @ReqMeta() meta: RequestMeta) {
    const r = await this.settings.update(body, user.id);
    await this.audit.log({ actor: user, action: 'settings.updated', targetType: 'settings', metadata: { changed: r.changed }, ip: meta.ip });
    return { settings: r.settings, changed: r.changed, policy: await this.settings.currentPolicy() };
  }
}
