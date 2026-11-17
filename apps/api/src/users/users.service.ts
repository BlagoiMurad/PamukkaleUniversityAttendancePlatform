import { Injectable } from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { ClockService } from '../common/clock.service';
import { AuthService, publicUser } from '../auth/auth.service';
import { PasswordService } from '../auth/password.service';
import { AppError } from '../common/errors';
import { normaliseEmail } from '../common/util';
import type { AuthUser } from '../common/auth-user';
import type { RequestMeta } from '../common/decorators';

export interface CreateUserInput {
  email: string;
  name: string;
  role: Role;
  universityId?: string | null;
  facultyNumber?: string | null;
  programme?: string | null;
  year?: number | null;
  group?: string | null;
  department?: string | null;
  faculty?: string | null;
  title?: string | null;
  sendInvite?: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly clock: ClockService,
    private readonly auth: AuthService,
    private readonly passwords: PasswordService,
  ) {}

  async list(f: { q?: string; role?: string; status?: string; page?: number; pageSize?: number }) {
    const where: Prisma.UserWhereInput = {};
    if (f.role && ['ADMIN', 'TEACHER', 'STUDENT'].includes(f.role)) where.role = f.role as Role;
    if (f.status && ['INVITED', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'].includes(f.status)) where.status = f.status as UserStatus;
    if (f.q) {
      where.OR = [
        { name: { contains: f.q, mode: 'insensitive' } },
        { email: { contains: f.q, mode: 'insensitive' } },
        { universityId: { contains: f.q } },
        { studentProfile: { facultyNumber: { contains: f.q } } },
      ];
    }
    const pageSize = Math.min(Math.max(f.pageSize ?? 25, 1), 200);
    const page = Math.max(f.page ?? 1, 1);
    const [total, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: { studentProfile: true, teacherProfile: true, _count: { select: { deviceSessions: { where: { revokedAt: null } } } } },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, items: items.map((u) => ({ ...publicUser(u), activeSessions: u._count.deviceSessions })) };
  }

  async get(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      include: {
        studentProfile: true,
        teacherProfile: true,
        enrollments: { include: { course: { select: { id: true, code: true, title: true, term: true } } }, orderBy: { validFrom: 'desc' } },
      },
    });
    if (!u) throw new AppError('NOT_FOUND', 'User not found');
    const sessions = await this.auth.listSessions(id);
    return { ...publicUser(u), enrollments: u.enrollments, sessions };
  }

  /**
   * Creates a user inside an optional transaction. Returns onboarding material once:
   * an activation link (preferred) or a temporary password, depending on settings.
   */
  async createUser(input: CreateUserInput, actor: AuthUser | null, meta: RequestMeta, tx?: Prisma.TransactionClient) {
    const settings = await this.settings.get();
    const client = tx ?? this.prisma;
    const email = normaliseEmail(input.email);
    if (await client.user.findUnique({ where: { email } })) throw new AppError('EMAIL_TAKEN', 'A user with this e-mail already exists');
    if (input.universityId && (await client.user.findUnique({ where: { universityId: input.universityId } }))) {
      throw new AppError('CONFLICT', 'University ID already in use');
    }
    if (input.role === 'STUDENT' && input.facultyNumber && (await client.studentProfile.findUnique({ where: { facultyNumber: input.facultyNumber } }))) {
      throw new AppError('CONFLICT', 'Faculty number already in use');
    }
    let tempPassword: string | null = null;
    let passwordHash: string | null = null;
    if (settings.onboardingMode === 'TEMP_PASSWORD') {
      tempPassword = this.passwords.generateTemporary();
      passwordHash = await this.passwords.hash(tempPassword);
    }
    const user = await client.user.create({
      data: {
        email,
        name: input.name.trim(),
        role: input.role,
        universityId: input.universityId || null,
        status: 'INVITED',
        passwordHash,
        mustChangePassword: !!tempPassword,
        tempPasswordExpiresAt: tempPassword ? new Date(this.clock.nowMs() + settings.activationTtlHours * 3600_000) : null,
        studentProfile:
          input.role === 'STUDENT'
            ? { create: { facultyNumber: input.facultyNumber || null, programme: input.programme || null, year: input.year ?? null, group: input.group || null } }
            : undefined,
        teacherProfile: input.role === 'TEACHER' ? { create: { department: input.department || null, faculty: input.faculty || null, title: input.title || null } } : undefined,
      },
    });
    let activationUrl: string | null = null;
    if (!tempPassword) activationUrl = this.auth.activationUrl(await this.auth.createActivationToken(user.id, tx));
    await this.audit.log({ actor, action: 'user.created', targetType: 'user', targetId: user.id, metadata: { role: user.role }, ip: meta.ip, requestId: meta.requestId }, tx);
    return { user, activationUrl, tempPassword };
  }

  async create(input: CreateUserInput, actor: AuthUser, meta: RequestMeta) {
    const { user, activationUrl, tempPassword } = await this.createUser(input, actor, meta);
    if (input.sendInvite !== false) await this.deliverOnboarding(user, activationUrl, tempPassword);
    // The link is shown once to the admin so onboarding also works without e-mail.
    return { user: publicUser(user), activationUrl, tempPassword };
  }

  async deliverOnboarding(user: { email: string; name: string }, activationUrl: string | null, tempPassword: string | null) {
    if (tempPassword) await this.auth.sendTemporaryPassword(user, tempPassword);
    else if (activationUrl) await this.auth.sendInvitation(user, new URL(activationUrl).searchParams.get('token')!);
  }

  async update(id: string, body: any, actor: AuthUser, meta: RequestMeta) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { studentProfile: true, teacherProfile: true } });
    if (!user) throw new AppError('NOT_FOUND');
    if (id === actor.id && (body.role && body.role !== user.role || body.status && body.status !== 'ACTIVE')) {
      throw new AppError('CONFLICT', 'You cannot change your own role or disable yourself');
    }
    const data: Prisma.UserUpdateInput = {};
    for (const k of ['name', 'universityId', 'role', 'status', 'preferredName', 'phone', 'locale'] as const) if (body[k] !== undefined) (data as any)[k] = body[k];
    if (body.email) data.email = normaliseEmail(body.email);
    const role = body.role ?? user.role;
    if (role === 'STUDENT' && body.studentProfile) {
      data.studentProfile = { upsert: { create: body.studentProfile, update: body.studentProfile } };
    }
    if (role === 'TEACHER' && body.teacherProfile) {
      data.teacherProfile = { upsert: { create: body.teacherProfile, update: body.teacherProfile } };
    }
    let revoked: string[] = [];
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id }, data });
        if (body.status === 'SUSPENDED' || body.status === 'ARCHIVED' || (body.role && body.role !== user.role)) {
          revoked = await this.auth.revokeAllSessions(tx, id, 'ACCESS_CHANGED');
        }
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError('CONFLICT', 'E-mail, university ID or faculty number already in use');
      throw e;
    }
    revoked.forEach((sid) => this.auth.notifyRevoked(sid, 'ACCESS_CHANGED'));
    await this.audit.log({ actor, action: 'user.updated', targetType: 'user', targetId: id, metadata: { fields: Object.keys(body) }, ip: meta.ip });
    return this.get(id);
  }

  async revokeSessions(id: string, actor: AuthUser, meta: RequestMeta) {
    const revoked = await this.prisma.$transaction((tx) => this.auth.revokeAllSessions(tx, id, 'REVOKED_BY_ADMIN'));
    revoked.forEach((sid) => this.auth.notifyRevoked(sid, 'REVOKED_BY_ADMIN'));
    await this.audit.log({ actor, action: 'user.sessions_revoked', targetType: 'user', targetId: id, metadata: { count: revoked.length }, ip: meta.ip });
    return { revoked: revoked.length };
  }

  async resendInvite(id: string, actor: AuthUser, meta: RequestMeta) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new AppError('NOT_FOUND');
    if (user.status !== 'INVITED') throw new AppError('CONFLICT', 'User has already activated the account');
    const settings = await this.settings.get();
    let activationUrl: string | null = null;
    let tempPassword: string | null = null;
    if (settings.onboardingMode === 'TEMP_PASSWORD') {
      tempPassword = this.passwords.generateTemporary();
      await this.prisma.user.update({
        where: { id },
        data: { passwordHash: await this.passwords.hash(tempPassword), mustChangePassword: true, tempPasswordExpiresAt: new Date(this.clock.nowMs() + settings.activationTtlHours * 3600_000) },
      });
    } else {
      activationUrl = this.auth.activationUrl(await this.auth.createActivationToken(id));
    }
    await this.deliverOnboarding(user, activationUrl, tempPassword);
    await this.audit.log({ actor, action: 'user.invite_resent', targetType: 'user', targetId: id, ip: meta.ip });
    return { activationUrl, tempPassword };
  }
}
