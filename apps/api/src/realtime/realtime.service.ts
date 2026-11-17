import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

/** Thin facade so domain services can emit events without depending on the gateway. */
@Injectable()
export class RealtimeService {
  private server: Server | null = null;
  private readonly logger = new Logger('Realtime');

  attach(server: Server) {
    this.server = server;
  }

  toUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }
  toDevice(sessionId: string, event: string, payload: unknown) {
    this.server?.to(`device:${sessionId}`).emit(event, payload);
  }
  /** Teacher/admin room for a lesson (projector + live roster). */
  toLessonStaff(lessonId: string, event: string, payload: unknown) {
    this.server?.to(`lesson:${lessonId}:staff`).emit(event, payload);
  }
  /** Enrolled students currently on the join/scan page. */
  toLessonStudents(lessonId: string, event: string, payload: unknown) {
    this.server?.to(`lesson:${lessonId}:students`).emit(event, payload);
  }
  /** Force-disconnect every socket of a revoked device session. */
  disconnectDevice(sessionId: string) {
    this.server?.in(`device:${sessionId}`).disconnectSockets(true);
  }
}
