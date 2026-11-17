import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LessonsService } from '../lessons/lessons.service';
import { SettingsService } from '../settings/settings.service';
import { ClockService } from '../common/clock.service';

@Injectable()
export class JobsService {
  private readonly logger = new Logger('Jobs');
  constructor(
    private readonly prisma: PrismaService,
    private readonly lessons: LessonsService,
    private readonly settings: SettingsService,
    private readonly clock: ClockService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async lifecycle() {
    if (process.env.NODE_ENV === 'test') return;
    await this.lessons.runLifecycleJobs().catch((e) => this.logger.warn(`lifecycle: ${e.message}`));
    // Expire stale challenges so they are visibly dead in the DB as well
    await this.prisma.attendanceChallenge.updateMany({ where: { status: 'ACTIVE', expiresAt: { lt: this.clock.now() } }, data: { status: 'EXPIRED' } });
  }

  /** Retention policy (spec 10, Q7). Runs nightly. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async retention() {
    if (process.env.NODE_ENV === 'test') return;
    const s = await this.settings.get();
    const now = this.clock.nowMs();
    const before = (days: number) => new Date(now - days * 86400_000);
    const tech = before(s.technicalRetentionDays);
    await this.prisma.attendanceChallenge.deleteMany({ where: { createdAt: { lt: tech } } });
    await this.prisma.idempotencyRecord.deleteMany({ where: { createdAt: { lt: tech } } });
    await this.prisma.oneTimeToken.deleteMany({ where: { expiresAt: { lt: tech } } });
    await this.prisma.deviceSession.deleteMany({ where: { OR: [{ revokedAt: { lt: tech } }, { expiresAt: { lt: tech } }] } });
    await this.prisma.importBatch.deleteMany({ where: { createdAt: { lt: tech } } });
    if (s.auditRetentionDays) await this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: before(s.auditRetentionDays) } } });
    if (s.requestRetentionDays) await this.prisma.attendanceRequest.deleteMany({ where: { createdAt: { lt: before(s.requestRetentionDays) }, status: { not: 'PENDING' } } });
    if (s.attendanceRetentionDays) {
      await this.prisma.lesson.deleteMany({ where: { status: { in: ['LOCKED', 'CANCELLED'] }, startsAt: { lt: before(s.attendanceRetentionDays) } } });
    }
    this.logger.log('retention run finished');
  }
}
