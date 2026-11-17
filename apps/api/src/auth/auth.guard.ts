import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors';
import { ALLOW_PENDING_PASSWORD, IS_PUBLIC, ROLES, SKIP_CSRF } from '../common/decorators';
import { safeEqual } from '../common/util';
import { ClockService } from '../common/clock.service';
import { TokenService } from './token.service';
import { ACCESS_COOKIE, CSRF_COOKIE, CSRF_HEADER } from './cookies';
import type { AuthUser } from '../common/auth-user';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Authenticates every request (unless @Public) and checks the device session is still active
 * on EVERY request, so a revoked phone loses access immediately (spec 4.2, E2E-04).
 * Also enforces roles and double-submit CSRF for cookie-authenticated mutations.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest();
    const targets = [ctx.getHandler(), ctx.getClass()];

    const skipCsrf = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF, targets);
    const bearer = (req.headers.authorization as string | undefined)?.match(/^Bearer (.+)$/)?.[1];
    const cookieToken = req.cookies?.[ACCESS_COOKIE];
    if (!skipCsrf && !SAFE_METHODS.has(req.method) && !bearer) {
      const header = req.headers[CSRF_HEADER] as string | undefined;
      const cookie = req.cookies?.[CSRF_COOKIE] as string | undefined;
      if (!header || !cookie || !safeEqual(header, cookie)) throw new AppError('CSRF_FAILED', 'Security token missing, reload the page');
    }

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const raw = bearer ?? cookieToken;
    if (!raw) throw new AppError('LOGIN_REQUIRED', 'Please sign in');
    const claims = this.tokens.verifyAccess(raw);
    if (claims === 'expired') throw new AppError('TOKEN_EXPIRED', 'Session token expired');
    if (!claims) throw new AppError('LOGIN_REQUIRED', 'Please sign in');

    const session = await this.prisma.deviceSession.findUnique({
      where: { id: claims.sid },
      select: { id: true, revokedAt: true, revokedReason: true, expiresAt: true, lastSeenAt: true, user: true },
    });
    const now = this.clock.now();
    if (!session) throw new AppError('LOGIN_REQUIRED');
    if (session.revokedAt) throw new AppError('SESSION_REVOKED', 'This session was ended', { reason: session.revokedReason });
    if (session.expiresAt < now) throw new AppError('LOGIN_REQUIRED');
    const user = session.user;
    if (user.status === 'SUSPENDED' || user.status === 'ARCHIVED') throw new AppError('ACCOUNT_DISABLED', 'This account is disabled');

    if (now.getTime() - session.lastSeenAt.getTime() > 60_000) {
      this.prisma.deviceSession.update({ where: { id: session.id }, data: { lastSeenAt: now } }).catch(() => undefined);
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sessionId: session.id,
      mustChangePassword: user.mustChangePassword,
    };
    req.user = authUser;

    if (user.mustChangePassword && !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD, targets)) {
      throw new AppError('PASSWORD_CHANGE_REQUIRED', 'You must change your temporary password first');
    }
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, targets);
    if (roles?.length && !roles.includes(user.role)) throw new AppError('FORBIDDEN', 'You do not have access to this resource');
    return true;
  }
}
