import { Logger, OnModuleDestroy } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { parse as parseCookie } from 'cookie';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from '../auth/token.service';
import { AccessService } from '../common/access.service';
import { ClockService } from '../common/clock.service';
import { RealtimeService } from './realtime.service';
import { LessonsService } from '../lessons/lessons.service';
import { ACCESS_COOKIE } from '../auth/cookies';
import { slotIndex } from '../lessons/markers';
import type { AuthUser } from '../common/auth-user';

const origins = () => (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map((s) => s.trim());

/**
 * Socket.IO gateway. Rooms: user:<id>, device:<sessionId>, lesson:<id>:staff, lesson:<id>:students.
 * Events: session.started, challenge.rotated / marker.rotated, attendance.updated, session.ended,
 * lesson.ended, auth.session.revoked. Clients must re-sync via HTTP after reconnect (spec 16.5, 19).
 */
@WebSocketGateway({ cors: { origin: origins(), credentials: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger('Gateway');
  private ticker: NodeJS.Timeout | null = null;
  private lastSlot = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly access: AccessService,
    private readonly realtime: RealtimeService,
    private readonly lessons: LessonsService,
    private readonly clock: ClockService,
  ) {}

  afterInit(server: Server) {
    this.realtime.attach(server);
    if (process.env.NODE_ENV !== 'test') this.ticker = setInterval(() => this.tick().catch(() => undefined), 250);
  }

  onModuleDestroy() {
    if (this.ticker) clearInterval(this.ticker);
  }

  async handleConnection(client: Socket) {
    try {
      const cookies = parseCookie(client.handshake.headers.cookie ?? '');
      const raw = cookies[ACCESS_COOKIE] ?? (client.handshake.auth?.token as string | undefined);
      const claims = raw ? this.tokens.verifyAccess(raw) : null;
      if (!claims || claims === 'expired') {
        client.emit('auth.error', { code: claims === 'expired' ? 'TOKEN_EXPIRED' : 'LOGIN_REQUIRED' });
        client.disconnect(true);
        return;
      }
      const session = await this.prisma.deviceSession.findUnique({ where: { id: claims.sid }, include: { user: true } });
      if (!session || session.revokedAt) {
        client.emit('auth.session.revoked', { reason: session?.revokedReason ?? 'UNKNOWN' });
        client.disconnect(true);
        return;
      }
      const user: AuthUser = { id: session.user.id, email: session.user.email, name: session.user.name, role: session.user.role, sessionId: session.id, mustChangePassword: session.user.mustChangePassword };
      client.data.user = user;
      await client.join([`user:${user.id}`, `device:${session.id}`]);
      client.emit('ready', { serverNow: this.clock.now().toISOString() });
    } catch (e) {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('lesson.subscribe')
  async subscribe(@ConnectedSocket() client: Socket, @MessageBody() body: { lessonId?: string }) {
    const user = client.data.user as AuthUser | undefined;
    if (!user || !body?.lessonId) return { ok: false };
    try {
      if (user.role === 'STUDENT') {
        const lesson = await this.prisma.lesson.findUnique({ where: { id: body.lessonId }, select: { courseId: true } });
        const enrolled = lesson && (await this.prisma.enrollment.count({ where: { courseId: lesson.courseId, studentId: user.id, state: 'ACTIVE' } }));
        if (!enrolled) return { ok: false };
        await client.join(`lesson:${body.lessonId}:students`);
      } else {
        await this.access.assertLessonStaff(user, body.lessonId);
        await client.join(`lesson:${body.lessonId}:staff`);
      }
      return { ok: true, serverNow: this.clock.now().toISOString() };
    } catch {
      return { ok: false };
    }
  }

  @SubscribeMessage('lesson.unsubscribe')
  async unsubscribe(@ConnectedSocket() client: Socket, @MessageBody() body: { lessonId?: string }) {
    if (body?.lessonId) {
      await client.leave(`lesson:${body.lessonId}:staff`);
      await client.leave(`lesson:${body.lessonId}:students`);
    }
    return { ok: true };
  }

  @SubscribeMessage('time.sync')
  timeSync() {
    return { serverNow: this.clock.now().toISOString() };
  }

  /** Pushes marker.rotated exactly at each 20-second boundary to projector screens that are online. */
  private async tick() {
    const rooms = this.server?.sockets.adapter.rooms;
    if (!rooms) return;
    const watched = [...rooms.keys()].filter((r) => r.startsWith('lesson:') && r.endsWith(':staff')).map((r) => r.split(':')[1]);
    if (!watched.length) {
      this.lastSlot.clear();
      return;
    }
    const lessons = await this.prisma.lesson.findMany({ where: { id: { in: watched }, status: 'ACTIVE' }, include: { course: { select: { code: true, title: true } } } });
    const now = this.clock.nowMs();
    for (const l of lessons) {
      if (!l.markerEpoch) continue;
      const slot = slotIndex(l.markerEpoch.getTime(), now, l.markerRotationSeconds);
      if (this.lastSlot.get(l.id) === slot) continue;
      this.lastSlot.set(l.id, slot);
      const state = this.lessons.computeDisplayState(l, l.course);
      this.server.to(`lesson:${l.id}:staff`).emit('marker.rotated', state);
      this.server.to(`lesson:${l.id}:staff`).emit('challenge.rotated', { lessonId: l.id, slot });
      this.server.to(`lesson:${l.id}:students`).emit('marker.rotated', { lessonId: l.id, slot, slotEndAt: state.slotEndAt });
    }
  }
}
