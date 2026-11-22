import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/errors';
import { randomToken, sha256 } from '../common/util';
import type { RequestMeta } from '../common/decorators';

/**
 * What the caller should do after a correct password was supplied.
 *
 * `ok`    - this browser is the account's bound device, carry on and sign in.
 * `bind`  - the account has no device yet; ask the student whether this is the phone they will
 *           always check in with, then call `bind()`. We do not bind silently, because the first
 *           browser someone happens to open is not necessarily the one they meant to commit to.
 * `blocked` - a different device. The response carries enough context for the "not your device"
 *           screen, including whether a request is already waiting for a teacher.
 */
export type DeviceDecision =
  | { kind: 'ok'; deviceToken?: string }
  | { kind: 'bind'; setupToken: string }
  | { kind: 'blocked'; code: 'DEVICE_NOT_RECOGNISED' | 'DEVICE_BOUND_TO_OTHER_ACCOUNT'; boundLabel: string | null; requestToken: string | null; pending: boolean };

@Injectable()
export class DeviceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Decides whether `user` may sign in from the browser presenting `cookieToken`.
   *
   * The cookie is the real credential. `fingerprint` is only ever used to restore a cookie that
   * was cleared, and only for a user who has just proved their password, so a matching
   * fingerprint on its own never grants access to anything.
   */
  async evaluate(user: User, cookieToken: string | undefined, fingerprint: string | undefined, meta: RequestMeta): Promise<DeviceDecision> {
    // Only students are tied to a device: the rule exists to stop one phone checking in for
    // several people. Teachers and admins work from lecture-room PCs, laptops and their own
    // phones, and locking them to one browser would create change requests with nobody to approve.
    if (user.role !== 'STUDENT') return { kind: 'ok' };

    const bound = await this.prisma.device.findUnique({ where: { userId: user.id } });
    const fpHash = fingerprint ? sha256(fingerprint) : null;

    if (cookieToken) {
      const device = await this.prisma.device.findUnique({ where: { tokenHash: sha256(cookieToken) } });
      if (device) {
        if (device.userId === user.id) {
          await this.prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date(), fingerprintHash: fpHash ?? device.fingerprintHash } });
          return { kind: 'ok' };
        }
        // This browser already belongs to somebody else: one device, one profile.
        await this.audit.log({ actor: user, action: 'device.rejected_shared', targetType: 'device', targetId: device.id, ip: meta.ip });
        return { kind: 'blocked', code: 'DEVICE_BOUND_TO_OTHER_ACCOUNT', boundLabel: null, requestToken: null, pending: false };
      }
      // A cookie we do not know (stale or copied) is treated as no cookie at all.
    }

    if (!bound) return { kind: 'bind', setupToken: await this.issueSetupToken(user.id) };

    // Cookie lost (cleared data, different browser on the same phone) but the hardware looks the
    // same. The password already matched, so re-issuing the cookie is safe enough and spares the
    // student a change request for something they did not do wrong.
    if (fpHash && bound.fingerprintHash && bound.fingerprintHash === fpHash) {
      const token = randomToken(32);
      await this.prisma.device.update({ where: { id: bound.id }, data: { tokenHash: sha256(token), lastSeenAt: new Date() } });
      await this.audit.log({ actor: user, action: 'device.cookie_restored', targetType: 'device', targetId: bound.id, ip: meta.ip });
      return { kind: 'ok', deviceToken: token };
    }

    const pending = await this.prisma.deviceChangeRequest.findFirst({ where: { userId: user.id, status: 'PENDING' } });
    return {
      kind: 'blocked',
      code: 'DEVICE_NOT_RECOGNISED',
      boundLabel: bound.label,
      requestToken: pending ? null : await this.issueSetupToken(user.id),
      pending: !!pending,
    };
  }

  /**
   * Short-lived proof that the holder just passed the password check, so `bind` and
   * `requestChange` can act for that user without a session existing yet.
   */
  private async issueSetupToken(userId: string) {
    const token = randomToken(24);
    await this.prisma.oneTimeToken.create({
      data: { userId, type: 'DEVICE_SETUP', tokenHash: sha256(token), expiresAt: new Date(Date.now() + 15 * 60_000) },
    });
    return token;
  }

  async consumeSetupToken(token: string) {
    const row = await this.prisma.oneTimeToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!row || row.type !== 'DEVICE_SETUP' || row.consumedAt || row.expiresAt < new Date()) {
      throw new AppError('TOKEN_INVALID', 'This link has expired. Sign in again to start over.');
    }
    await this.prisma.oneTimeToken.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
    return row.user;
  }

  /** First-time binding, after the student confirmed this is the device they will always use. */
  async bind(user: User, fingerprint: string | undefined, label: string | undefined, meta: RequestMeta) {
    const existing = await this.prisma.device.findUnique({ where: { userId: user.id } });
    if (existing) throw new AppError('CONFLICT', 'This account already has a device');
    const token = randomToken(32);
    const device = await this.prisma.device.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        fingerprintHash: fingerprint ? sha256(fingerprint) : null,
        label: label?.slice(0, 80) || null,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
      },
    });
    await this.audit.log({ actor: user, action: 'device.bound', targetType: 'device', targetId: device.id, metadata: { label: device.label }, ip: meta.ip });
    return token;
  }

  /** Raised from the blocked-login screen; the new device's identity is stored with the request. */
  async requestChange(user: User, reason: string, fingerprint: string | undefined, label: string | undefined, meta: RequestMeta) {
    const open = await this.prisma.deviceChangeRequest.findFirst({ where: { userId: user.id, status: 'PENDING' } });
    if (open) throw new AppError('DEVICE_REQUEST_PENDING', 'A device change request is already waiting for approval');
    const bound = await this.prisma.device.findUnique({ where: { userId: user.id } });
    const newToken = randomToken(32);
    const req = await this.prisma.deviceChangeRequest.create({
      data: {
        userId: user.id,
        reason: reason.trim(),
        newTokenHash: sha256(newToken),
        newFingerprint: fingerprint ? sha256(fingerprint) : null,
        newLabel: label?.slice(0, 80) || null,
        newUserAgent: meta.userAgent?.slice(0, 300) ?? null,
        previousLabel: bound?.label ?? null,
      },
    });
    await this.audit.log({ actor: user, action: 'device.change_requested', targetType: 'device_change_request', targetId: req.id, ip: meta.ip });
    // The browser keeps this cookie so that, once approved, it is already the bound device.
    return { request: req, deviceToken: newToken };
  }

  /** Approving swaps the bound device for the one that asked, and signs the old one out. */
  async review(requestId: string, approve: boolean, reviewer: User, note: string | undefined, meta: RequestMeta) {
    const req = await this.prisma.deviceChangeRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new AppError('NOT_FOUND', 'Request not found');
    if (req.status !== 'PENDING') throw new AppError('CONFLICT', 'This request has already been reviewed');

    await this.prisma.$transaction(async (tx) => {
      await tx.deviceChangeRequest.update({
        where: { id: req.id },
        data: { status: approve ? 'APPROVED' : 'REJECTED', reviewerId: reviewer.id, reviewNote: note?.slice(0, 500) ?? null, reviewedAt: new Date() },
      });
      if (!approve) return;
      // Only one device may exist per user, so the old row goes before the new one lands.
      await tx.device.deleteMany({ where: { userId: req.userId } });
      await tx.device.create({
        data: {
          userId: req.userId,
          tokenHash: req.newTokenHash,
          fingerprintHash: req.newFingerprint,
          label: req.newLabel,
          userAgent: req.newUserAgent,
        },
      });
      // Anything signed in on the old device must stop being able to check in.
      await tx.deviceSession.updateMany({
        where: { userId: req.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'DEVICE_CHANGED' },
      });
    });

    await this.audit.log({
      actor: reviewer,
      action: approve ? 'device.change_approved' : 'device.change_rejected',
      targetType: 'device_change_request',
      targetId: req.id,
      metadata: { student: req.userId },
      ip: meta.ip,
    });
    return { ok: true };
  }

  async listRequests(status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | undefined) {
    const items = await this.prisma.deviceChangeRequest.findMany({
      where: status ? { status } : {},
      include: {
        user: { select: { id: true, name: true, email: true, studentProfile: { select: { facultyNumber: true, year: true } } } },
        reviewer: { select: { id: true, name: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return { items };
  }
}
