import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService, publicUser } from './auth.service';
import { TokenService } from './token.service';
import { ACCESS_COOKIE, clearAuthCookies, REFRESH_COOKIE, setAuthCookies, setCsrfCookie, CSRF_COOKIE } from './cookies';
import { AllowPendingPassword, CurrentUser, Public, ReqMeta, RequestMeta, SkipCsrf } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { randomToken } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/auth-user';
import { SettingsService } from '../settings/settings.service';

const loginSchema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200), deviceLabel: z.string().max(80).optional() });
const mfaLoginSchema = z.object({ mfaToken: z.string().min(10), code: z.string().min(6).max(10), deviceLabel: z.string().max(80).optional() });
const changeSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(1).max(200) });
const tokenPasswordSchema = z.object({ token: z.string().min(10).max(200), password: z.string().min(1).max(200) });
const emailSchema = z.object({ email: z.string().email().max(200) });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Issues the double-submit CSRF cookie. Called by the web app on boot. */
  @Public()
  @Get('csrf')
  csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = (req.cookies?.[CSRF_COOKIE] as string) || randomToken(24);
    setCsrfCookie(res, token);
    return { csrfToken: token };
  }

  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(@Body(new ZodPipe(loginSchema)) body: z.infer<typeof loginSchema>, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(body.email, body.password, body.deviceLabel, meta);
    if (result.mfaRequired) return { mfaRequired: true, mfaToken: result.mfaToken };
    const { issued } = result;
    setAuthCookies(res, issued.accessToken, issued.refreshToken, this.tokens.accessTtlSec, this.tokens.refreshTtlDays);
    return { user: publicUser(issued.user), mustChangePassword: issued.user.mustChangePassword, ...exposeToken(issued.accessToken) };
  }

  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('mfa/verify')
  async mfaVerify(@Body(new ZodPipe(mfaLoginSchema)) body: z.infer<typeof mfaLoginSchema>, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    const issued = await this.auth.completeMfaLogin(body.mfaToken, body.code, body.deviceLabel, meta);
    setAuthCookies(res, issued.accessToken, issued.refreshToken, this.tokens.accessTtlSec, this.tokens.refreshTtlDays);
    return { user: publicUser(issued.user), mustChangePassword: issued.user.mustChangePassword, ...exposeToken(issued.accessToken) };
  }

  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: Request, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    try {
      const out = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], meta);
      setAuthCookies(res, out.accessToken, out.refreshToken, this.tokens.accessTtlSec, this.tokens.refreshTtlDays);
      return { user: publicUser(out.user) };
    } catch (e) {
      clearAuthCookies(res);
      throw e;
    }
  }

  @AllowPendingPassword()
  @HttpCode(200)
  @Post('logout')
  async logout(@CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.sessionId, user, meta);
    clearAuthCookies(res);
    return { ok: true };
  }

  @AllowPendingPassword()
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { studentProfile: true, teacherProfile: true } });
    return { user: publicUser(u), sessionId: user.sessionId, settings: await this.settings.getPublic() };
  }

  @AllowPendingPassword()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('change-password')
  async changePassword(@CurrentUser() user: AuthUser, @Body(new ZodPipe(changeSchema)) body: z.infer<typeof changeSchema>, @ReqMeta() meta: RequestMeta) {
    await this.auth.changePassword(user.id, user.sessionId, body.currentPassword, body.newPassword, meta);
    return { ok: true };
  }

  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('activate')
  async activate(@Body(new ZodPipe(tokenPasswordSchema)) body: z.infer<typeof tokenPasswordSchema>, @ReqMeta() meta: RequestMeta) {
    const user = await this.auth.activate(body.token, body.password, meta);
    return { ok: true, email: user.email };
  }

  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(202)
  @Post('forgot-password')
  async forgot(@Body(new ZodPipe(emailSchema)) body: z.infer<typeof emailSchema>, @ReqMeta() meta: RequestMeta) {
    await this.auth.forgotPassword(body.email, meta);
    return { ok: true }; // identical response whether or not the account exists
  }

  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('reset-password')
  async reset(@Body(new ZodPipe(tokenPasswordSchema)) body: z.infer<typeof tokenPasswordSchema>, @ReqMeta() meta: RequestMeta) {
    await this.auth.resetPassword(body.token, body.password, meta);
    return { ok: true };
  }

  @Get('sessions')
  async sessions(@CurrentUser() user: AuthUser) {
    const list = await this.auth.listSessions(user.id);
    return { items: list.map((s) => ({ ...s, current: s.id === user.sessionId })) };
  }

  @Delete('sessions/:id')
  async revoke(@CurrentUser() user: AuthUser, @Param('id') id: string, @ReqMeta() meta: RequestMeta) {
    await this.auth.revokeSession(user.id, id, user, meta);
    return { ok: true };
  }

  @Post('mfa/setup')
  mfaSetup(@CurrentUser() user: AuthUser) {
    return this.auth.mfaSetup(user.id);
  }

  @HttpCode(200)
  @Post('mfa/enable')
  async mfaEnable(@CurrentUser() user: AuthUser, @Body(new ZodPipe(z.object({ code: z.string().min(6).max(10) }))) body: { code: string }, @ReqMeta() meta: RequestMeta) {
    await this.auth.mfaEnable(user.id, body.code, meta);
    return { ok: true };
  }

  @HttpCode(200)
  @Post('mfa/disable')
  async mfaDisable(@CurrentUser() user: AuthUser, @Body(new ZodPipe(z.object({ password: z.string().min(1) }))) body: { password: string }, @ReqMeta() meta: RequestMeta) {
    await this.auth.mfaDisable(user.id, body.password, meta);
    return { ok: true };
  }
}

export { ACCESS_COOKIE };

/** The access token lives in an HttpOnly cookie; it is only echoed in the body for API tests. */
function exposeToken(token: string) {
  return process.env.NODE_ENV === 'test' ? { accessToken: token } : {};
}
