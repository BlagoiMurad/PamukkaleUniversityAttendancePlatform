import { Injectable } from '@nestjs/common';
import { DeviceSession, OneTimeTokenType, Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors';
import { coarseIp, normaliseEmail, randomToken, safeEqual, sha256 } from '../common/util';
import { ClockService } from '../common/clock.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { RealtimeService } from '../realtime/realtime.service';
import { MailService } from '../mail/mail.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import type { RequestMeta } from '../common/decorators';

const MAX_FAILED_LOGINS = 8;
const LOCK_MINUTES = 15;
const RESET_TTL_MINUTES = 30;

export interface IssuedSession {
  user: User;
  session: DeviceSession;
  accessToken: string;
  refreshToken: string;
}

export const publicUser = (u: User & { studentProfile?: any; teacherProfile?: any }) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  preferredName: u.preferredName,
  phone: u.phone,
  locale: u.locale,
  role: u.role,
  status: u.status,
  universityId: u.universityId,
  mustChangePassword: u.mustChangePassword,
  lastLoginAt: u.lastLoginAt,
  createdAt: u.createdAt,
  studentProfile: u.studentProfile ?? undefined,
  teacherProfile: u.teacherProfile ?? undefined,
});

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly clock: ClockService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly realtime: RealtimeService,
    private readonly mail: MailService,
  ) {}

  // ---------------------------------------------------------------- login
  /**
   * `gate` runs after the password is accepted but before any session exists, so a login from a
   * device that is not allowed never revokes the sessions of the device that is.
   */
  async login<T extends { kind: string }>(
    emailRaw: string,
    password: string,
    deviceLabel: string | undefined,
    meta: RequestMeta,
    gate?: (user: User) => Promise<T>,
  ) {
    const email = normaliseEmail(emailRaw);
    const user = await this.prisma.user.findUnique({ where: { email } });
    const now = this.clock.now();

    if (user?.lockedUntil && user.lockedUntil > now) {
      throw new AppError('ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.', { until: user.lockedUntil });
    }
    const ok = await this.passwords.verify(user?.passwordHash, password);
    if (!user || !ok) {
      if (user) {
        const failed = user.failedLoginCount + 1;
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: failed >= MAX_FAILED_LOGINS ? 0 : failed,
            lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null,
          },
        });
        await this.audit.log({ actor: user, action: 'auth.login_failed', targetType: 'user', targetId: user.id, ip: meta.ip, requestId: meta.requestId });
      }
      throw new AppError('INVALID_CREDENTIALS', 'E-mail or password is incorrect');
    }
    if (user.status === 'SUSPENDED' || user.status === 'ARCHIVED') throw new AppError('ACCOUNT_DISABLED', 'This account is disabled');
    if (user.mustChangePassword && user.tempPasswordExpiresAt && user.tempPasswordExpiresAt < now) {
      throw new AppError('TEMP_PASSWORD_EXPIRED', 'The temporary password has expired. Ask for a new invitation.');
    }

    if (gate) {
      const decision = await gate(user);
      if (decision.kind !== 'ok') return { blocked: decision };
      return { blocked: undefined, decision, issued: await this.issueSession(user, deviceLabel, meta, false) };
    }
    return { blocked: undefined, decision: undefined, issued: await this.issueSession(user, deviceLabel, meta, false) };
  }



  private async issueSession(user: User, deviceLabel: string | undefined, meta: RequestMeta, mfaVerified: boolean): Promise<IssuedSession> {
    const settings = await this.settings.get();
    const now = this.clock.now();
    const family = randomToken(16);
    const secret = randomToken(32);

    const { session, revoked } = await this.prisma.$transaction(async (tx) => {
      let revoked: string[] = [];
      // One active device for students (spec 4.2 / 18.3). Revocation and creation are atomic.
      if (user.role === 'STUDENT' && settings.studentSingleSession) {
        revoked = await this.revokeAllSessions(tx, user.id, 'NEW_DEVICE_LOGIN');
      } else if (user.role !== 'STUDENT' && settings.teacherMaxSessions > 0) {
        const active = await tx.deviceSession.findMany({
          where: { userId: user.id, revokedAt: null, expiresAt: { gt: now } },
          orderBy: { lastSeenAt: 'asc' },
        });
        const excess = active.length - settings.teacherMaxSessions + 1;
        if (excess > 0) {
          const ids = active.slice(0, excess).map((s) => s.id);
          await tx.deviceSession.updateMany({ where: { id: { in: ids } }, data: { revokedAt: now, revokedReason: 'SESSION_LIMIT' } });
          await tx.attendanceChallenge.updateMany({ where: { deviceSessionId: { in: ids }, status: 'ACTIVE' }, data: { status: 'REVOKED' } });
          revoked = ids;
        }
      }
      const session = await tx.deviceSession.create({
        data: {
          userId: user.id,
          refreshTokenFamily: family,
          refreshTokenHash: '',
          deviceLabel: deviceLabel?.slice(0, 80) || describeAgent(meta.userAgent),
          userAgent: meta.userAgent?.slice(0, 300),
          ipCoarse: coarseIp(meta.ip),
          mfaVerified,
          expiresAt: new Date(now.getTime() + this.tokens.refreshTtlDays * 86400_000),
        },
      });
      const refreshToken = `${session.id}.${secret}`;
      await tx.deviceSession.update({ where: { id: session.id }, data: { refreshTokenHash: sha256(refreshToken) } });
      await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now } });
      return { session, revoked };
    });

    for (const sid of revoked) this.notifyRevoked(sid, 'NEW_DEVICE_LOGIN');
    await this.audit.log({
      actor: user,
      action: 'auth.login',
      targetType: 'device_session',
      targetId: session.id,
      metadata: { revokedSessions: revoked.length, device: session.deviceLabel },
      ip: meta.ip,
      requestId: meta.requestId,
    });
    return {
      user,
      session,
      accessToken: this.tokens.signAccess({ sub: user.id, sid: session.id, role: user.role }),
      refreshToken: `${session.id}.${secret}`,
    };
  }

  /** Revokes every active session of a user and their pending challenges. Returns revoked ids. */
  async revokeAllSessions(tx: Prisma.TransactionClient, userId: string, reason: string, exceptSessionId?: string) {
    const now = this.clock.now();
    const active = await tx.deviceSession.findMany({
      where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      select: { id: true },
    });
    const ids = active.map((s) => s.id);
    if (ids.length) {
      await tx.deviceSession.updateMany({ where: { id: { in: ids } }, data: { revokedAt: now, revokedReason: reason } });
      await tx.attendanceChallenge.updateMany({ where: { deviceSessionId: { in: ids }, status: 'ACTIVE' }, data: { status: 'REVOKED' } });
    }
    return ids;
  }

  notifyRevoked(sessionId: string, reason: string) {
    this.realtime.toDevice(sessionId, 'auth.session.revoked', { reason });
    setTimeout(() => this.realtime.disconnectDevice(sessionId), 250);
  }

  // ---------------------------------------------------------------- refresh / logout
  async refresh(refreshToken: string | undefined, meta: RequestMeta) {
    if (!refreshToken || !refreshToken.includes('.')) throw new AppError('LOGIN_REQUIRED');
    const [sid] = refreshToken.split('.');
    const now = this.clock.now();
    const session = await this.prisma.deviceSession.findUnique({ where: { id: sid }, include: { user: true } }).catch(() => null);
    if (!session) throw new AppError('LOGIN_REQUIRED');
    if (session.revokedAt) {
      throw new AppError('SESSION_REVOKED', 'This session was ended', { reason: session.revokedReason });
    }
    if (session.expiresAt < now) throw new AppError('LOGIN_REQUIRED');
    if (!safeEqual(session.refreshTokenHash, sha256(refreshToken))) {
      // Reuse of an already rotated refresh token => likely theft. Kill the whole family.
      await this.prisma.$transaction((tx) => this.revokeAllSessions(tx, session.userId, 'REFRESH_TOKEN_REUSE'));
      this.notifyRevoked(session.id, 'REFRESH_TOKEN_REUSE');
      await this.audit.log({ actor: session.user, action: 'auth.refresh_reuse_detected', targetType: 'device_session', targetId: session.id, ip: meta.ip });
      throw new AppError('SESSION_REVOKED', 'Session ended for security reasons', { reason: 'REFRESH_TOKEN_REUSE' });
    }
    const u = session.user;
    if (u.status === 'SUSPENDED' || u.status === 'ARCHIVED') throw new AppError('ACCOUNT_DISABLED');
    const next = `${session.id}.${randomToken(32)}`;
    // Optimistic rotation: only succeeds if nobody rotated concurrently.
    const rotated = await this.prisma.deviceSession.updateMany({
      where: { id: session.id, refreshTokenHash: session.refreshTokenHash, revokedAt: null },
      data: { refreshTokenHash: sha256(next), lastSeenAt: now },
    });
    if (rotated.count !== 1) throw new AppError('LOGIN_REQUIRED');
    return { user: u, accessToken: this.tokens.signAccess({ sub: u.id, sid: session.id, role: u.role }), refreshToken: next };
  }

  async logout(sessionId: string, actor: { id: string; email: string; role: any }, meta: RequestMeta) {
    await this.prisma.$transaction(async (tx) => {
      await tx.deviceSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: this.clock.now(), revokedReason: 'LOGOUT' } });
      await tx.attendanceChallenge.updateMany({ where: { deviceSessionId: sessionId, status: 'ACTIVE' }, data: { status: 'REVOKED' } });
    });
    await this.audit.log({ actor, action: 'auth.logout', targetType: 'device_session', targetId: sessionId, ip: meta.ip });
  }

  // ---------------------------------------------------------------- passwords
  async changePassword(userId: string, sessionId: string, current: string, next: string, meta: RequestMeta) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await this.passwords.verify(user.passwordHash, current))) throw new AppError('INVALID_CREDENTIALS', 'Current password is incorrect');
    if (current === next) throw new AppError('WEAK_PASSWORD', 'Choose a new password that differs from the current one');
    const weak = this.passwords.check(next, user);
    if (weak) throw new AppError('WEAK_PASSWORD', weak);
    const hash = await this.passwords.hash(next);
    const revoked = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: hash, mustChangePassword: false, tempPasswordExpiresAt: null, passwordChangedAt: this.clock.now(), status: 'ACTIVE', emailVerified: true },
      });
      // Other devices are signed out after a password change.
      return this.revokeAllSessions(tx, userId, 'PASSWORD_CHANGED', sessionId);
    });
    revoked.forEach((sid) => this.notifyRevoked(sid, 'PASSWORD_CHANGED'));
    await this.audit.log({ actor: user, action: 'auth.password_changed', targetType: 'user', targetId: userId, ip: meta.ip });
  }

  /** Creates a one-time activation link (spec 4.1 preferred flow). Returns the raw token once. */
  async createActivationToken(userId: string, tx?: Prisma.TransactionClient) {
    const settings = await this.settings.get();
    const token = randomToken(32);
    const client = tx ?? this.prisma;
    await client.oneTimeToken.updateMany({ where: { userId, type: 'ACTIVATION', consumedAt: null }, data: { consumedAt: this.clock.now() } });
    await client.oneTimeToken.create({
      data: { userId, type: 'ACTIVATION', tokenHash: sha256(token), expiresAt: new Date(this.clock.nowMs() + settings.activationTtlHours * 3600_000) },
    });
    return token;
  }

  activationUrl(token: string) {
    return `${process.env.PUBLIC_WEB_URL ?? ''}/activate?token=${encodeURIComponent(token)}`;
  }

  async sendInvitation(user: { email: string; name: string }, token: string) {
    const settings = await this.settings.get();
    const url = this.activationUrl(token);
    await this.mail.send({
      to: user.email,
      subject: `${settings.universityName} – activate your attendance account`,
      text: `Hello ${user.name},\n\nAn account was created for you on the ${settings.universityName} attendance platform.\nSet your password using this one-time link (valid for ${settings.activationTtlHours} hours):\n\n${url}\n\nIf you did not expect this e-mail you can ignore it.`,
    });
  }

  async sendTemporaryPassword(user: { email: string; name: string }, tempPassword: string) {
    const settings = await this.settings.get();
    await this.mail.send({
      to: user.email,
      subject: `${settings.universityName} – your attendance account`,
      text: `Hello ${user.name},\n\nYour temporary password is: ${tempPassword}\nIt is valid for ${settings.activationTtlHours} hours and must be changed at first sign-in: ${process.env.PUBLIC_WEB_URL ?? ''}/login`,
    });
  }

  async consumeToken(type: OneTimeTokenType, raw: string) {
    const now = this.clock.now();
    const token = await this.prisma.oneTimeToken.findUnique({ where: { tokenHash: sha256(raw) }, include: { user: true } });
    if (!token || token.type !== type || token.consumedAt || token.expiresAt < now) throw new AppError('TOKEN_INVALID', 'This link is invalid or has expired');
    return token;
  }

  async activate(raw: string, password: string, meta: RequestMeta) {
    const token = await this.consumeToken('ACTIVATION', raw);
    const weak = this.passwords.check(password, token.user);
    if (weak) throw new AppError('WEAK_PASSWORD', weak);
    const hash = await this.passwords.hash(password);
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.oneTimeToken.updateMany({ where: { id: token.id, consumedAt: null }, data: { consumedAt: this.clock.now() } });
      if (c.count !== 1) throw new AppError('TOKEN_INVALID');
      await tx.user.update({
        where: { id: token.userId },
        data: { passwordHash: hash, status: 'ACTIVE', emailVerified: true, mustChangePassword: false, tempPasswordExpiresAt: null, passwordChangedAt: this.clock.now() },
      });
    });
    await this.audit.log({ actor: token.user, action: 'auth.activated', targetType: 'user', targetId: token.userId, ip: meta.ip });
    return token.user;
  }

  /** Never reveals whether the account exists (spec 9). */
  async forgotPassword(emailRaw: string, meta: RequestMeta) {
    const user = await this.prisma.user.findUnique({ where: { email: normaliseEmail(emailRaw) } });
    if (!user || user.status === 'SUSPENDED' || user.status === 'ARCHIVED') return;
    const settings = await this.settings.get();
    if (user.status === 'INVITED' && !user.passwordHash) {
      const t = await this.createActivationToken(user.id);
      await this.sendInvitation(user, t);
    } else {
      const token = randomToken(32);
      await this.prisma.oneTimeToken.updateMany({ where: { userId: user.id, type: 'PASSWORD_RESET', consumedAt: null }, data: { consumedAt: this.clock.now() } });
      await this.prisma.oneTimeToken.create({
        data: { userId: user.id, type: 'PASSWORD_RESET', tokenHash: sha256(token), expiresAt: new Date(this.clock.nowMs() + RESET_TTL_MINUTES * 60_000) },
      });
      await this.mail.send({
        to: user.email,
        subject: `${settings.universityName} – reset your password`,
        text: `Hello ${user.name},\n\nUse this link within ${RESET_TTL_MINUTES} minutes to choose a new password:\n${process.env.PUBLIC_WEB_URL ?? ''}/reset-password?token=${encodeURIComponent(token)}\n\nIf you did not ask for this, ignore this e-mail.`,
      });
    }
    await this.audit.log({ actor: user, action: 'auth.password_reset_requested', targetType: 'user', targetId: user.id, ip: meta.ip });
  }

  async resetPassword(raw: string, password: string, meta: RequestMeta) {
    const token = await this.consumeToken('PASSWORD_RESET', raw);
    const weak = this.passwords.check(password, token.user);
    if (weak) throw new AppError('WEAK_PASSWORD', weak);
    const hash = await this.passwords.hash(password);
    const revoked = await this.prisma.$transaction(async (tx) => {
      const c = await tx.oneTimeToken.updateMany({ where: { id: token.id, consumedAt: null }, data: { consumedAt: this.clock.now() } });
      if (c.count !== 1) throw new AppError('TOKEN_INVALID');
      await tx.user.update({
        where: { id: token.userId },
        data: { passwordHash: hash, mustChangePassword: false, tempPasswordExpiresAt: null, passwordChangedAt: this.clock.now(), failedLoginCount: 0, lockedUntil: null },
      });
      return this.revokeAllSessions(tx, token.userId, 'PASSWORD_RESET');
    });
    revoked.forEach((sid) => this.notifyRevoked(sid, 'PASSWORD_RESET'));
    await this.audit.log({ actor: token.user, action: 'auth.password_reset', targetType: 'user', targetId: token.userId, ip: meta.ip });
  }



  // ---------------------------------------------------------------- sessions
  listSessions(userId: string) {
    return this.prisma.deviceSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, deviceLabel: true, ipCoarse: true, createdAt: true, lastSeenAt: true, revokedAt: true, revokedReason: true, expiresAt: true },
    });
  }

  async revokeSession(userId: string, sessionId: string, actor: { id: string; email: string; role: any }, meta: RequestMeta) {
    const s = await this.prisma.deviceSession.findFirst({ where: { id: sessionId, userId } });
    if (!s) throw new AppError('NOT_FOUND');
    await this.prisma.$transaction(async (tx) => {
      await tx.deviceSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: this.clock.now(), revokedReason: 'REVOKED_BY_USER' } });
      await tx.attendanceChallenge.updateMany({ where: { deviceSessionId: sessionId, status: 'ACTIVE' }, data: { status: 'REVOKED' } });
    });
    this.notifyRevoked(sessionId, 'REVOKED_BY_USER');
    await this.audit.log({ actor, action: 'auth.session_revoked', targetType: 'device_session', targetId: sessionId, ip: meta.ip });
  }
}

function describeAgent(ua?: string) {
  if (!ua) return 'Unknown device';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${browser} on ${os}`;
}
