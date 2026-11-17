import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { coarseIp } from '../common/util';

export interface AuditInput {
  actor?: { id: string; email?: string; role?: Role } | null;
  action: string;
  targetType?: string;
  targetId?: string;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  requestId?: string | null;
}

/** Append-only audit log. No secrets, tokens, photos or full IPs are ever written here (spec 10). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        actorId: input.actor?.id ?? null,
        actorEmail: input.actor?.email ?? null,
        actorRole: input.actor?.role ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        reason: input.reason ?? null,
        metadata: (input.metadata as any) ?? undefined,
        ipCoarse: coarseIp(input.ip),
        requestId: input.requestId ?? null,
      },
    });
  }
}
