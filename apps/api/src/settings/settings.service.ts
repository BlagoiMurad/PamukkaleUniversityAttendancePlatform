import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors';
import { DEFAULT_SETTINGS, PUBLIC_SETTING_KEYS, Settings, settingsSchema } from './settings.defaults';

const POLICY_KEYS: (keyof Settings)[] = ['lateAfterMinutes', 'checkinCloseAfterMinutes', 'markerGraceMs'];

@Injectable()
export class SettingsService {
  private cache: { value: Settings; at: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<Settings> {
    if (this.cache && Date.now() - this.cache.at < 5000) return this.cache.value;
    const rows = await this.prisma.setting.findMany();
    const merged: any = { ...DEFAULT_SETTINGS };
    for (const row of rows) if (row.key in DEFAULT_SETTINGS) merged[row.key] = row.value;
    const parsed = settingsSchema.safeParse(merged);
    const value = parsed.success ? parsed.data : DEFAULT_SETTINGS;
    this.cache = { value, at: Date.now() };
    return value;
  }

  async getPublic() {
    const s = await this.get();
    return Object.fromEntries(PUBLIC_SETTING_KEYS.map((k) => [k, s[k]]));
  }

  async update(patch: Partial<Settings>, actorId: string) {
    const current = await this.get();
    const next = settingsSchema.safeParse({ ...current, ...patch });
    if (!next.success) {
      throw new AppError('VALIDATION_FAILED', 'Invalid settings', {
        issues: next.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const changed = (Object.keys(patch) as (keyof Settings)[]).filter(
      (k) => k in DEFAULT_SETTINGS && JSON.stringify(current[k]) !== JSON.stringify(next.data[k]),
    );
    await this.prisma.$transaction(async (tx) => {
      for (const key of changed) {
        await tx.setting.upsert({
          where: { key },
          create: { key, value: next.data[key] as any, updatedById: actorId },
          update: { value: next.data[key] as any, updatedById: actorId },
        });
      }
      if (changed.some((k) => POLICY_KEYS.includes(k))) {
        await tx.attendancePolicy.create({
          data: {
            lateAfterSeconds: next.data.lateAfterMinutes * 60,
            checkinCloseAfterSeconds: next.data.checkinCloseAfterMinutes ? next.data.checkinCloseAfterMinutes * 60 : null,
            graceMs: next.data.markerGraceMs,
            createdById: actorId,
          },
        });
      }
    });
    this.cache = null;
    return { settings: next.data, changed };
  }

  /** Current attendance policy version; created on first use. */
  async currentPolicy() {
    const latest = await this.prisma.attendancePolicy.findFirst({ orderBy: { version: 'desc' } });
    if (latest) return latest;
    const s = await this.get();
    return this.prisma.attendancePolicy.create({
      data: {
        lateAfterSeconds: s.lateAfterMinutes * 60,
        checkinCloseAfterSeconds: s.checkinCloseAfterMinutes ? s.checkinCloseAfterMinutes * 60 : null,
        graceMs: s.markerGraceMs,
      },
    });
  }

  clearCache() {
    this.cache = null;
  }
}
