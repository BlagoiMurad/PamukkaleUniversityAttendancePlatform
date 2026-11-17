import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';
import type { AuthUser } from './auth-user';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/** Endpoints reachable while the user still has to change a temporary password. */
export const ALLOW_PENDING_PASSWORD = 'allowPendingPassword';
export const AllowPendingPassword = () => SetMetadata(ALLOW_PENDING_PASSWORD, true);

export const SKIP_CSRF = 'skipCsrf';
export const SkipCsrf = () => SetMetadata(SKIP_CSRF, true);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

export const ReqMeta = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return { ip: req.ip as string | undefined, userAgent: req.headers['user-agent'] as string | undefined, requestId: req.requestId as string | undefined };
});
export type RequestMeta = { ip?: string; userAgent?: string; requestId?: string };
