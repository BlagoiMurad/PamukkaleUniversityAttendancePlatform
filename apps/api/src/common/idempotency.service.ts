import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from './errors';
import { sha256 } from './util';

/**
 * Idempotency-Key support (spec 8: mandatory for verify, import commit and lesson start).
 * The first request with a key stores its successful response; replays get the stored response.
 * Failed requests release the key so the client can retry with the same key.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(userId: string, scope: string, key: string | undefined, body: unknown, fn: () => Promise<T>): Promise<T> {
    if (!key || key.length < 8 || key.length > 128) throw new AppError('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
    const requestHash = sha256(JSON.stringify(body ?? null));
    let record;
    try {
      record = await this.prisma.idempotencyRecord.create({ data: { key, userId, scope, requestHash } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      const existing = await this.prisma.idempotencyRecord.findUnique({ where: { userId_scope_key: { userId, scope, key } } });
      if (!existing) throw new AppError('IDEMPOTENCY_IN_PROGRESS', 'Retry in a moment');
      if (existing.requestHash !== requestHash) throw new AppError('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key was used with a different request');
      if (existing.statusCode == null) throw new AppError('IDEMPOTENCY_IN_PROGRESS', 'The original request is still being processed');
      return existing.responseBody as T;
    }
    try {
      const result = await fn();
      await this.prisma.idempotencyRecord.update({ where: { id: record.id }, data: { statusCode: 200, responseBody: (result ?? null) as any } });
      return result;
    } catch (e) {
      await this.prisma.idempotencyRecord.delete({ where: { id: record.id } }).catch(() => undefined);
      throw e;
    }
  }
}
