import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Roles } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('audit')
@Roles('ADMIN')
@Controller()
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(['audit-events', 'admin/audit'])
  async list(
    @Query('q') q?: string,
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
    @Query('targetId') targetId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cursor') cursor?: string,
    @Query('take') takeRaw?: string,
  ) {
    const take = Math.min(Number(takeRaw) || 50, 200);
    const where: Prisma.AuditLogWhereInput = {};
    if (action) where.action = { startsWith: action };
    if (actorId) where.actorId = actorId;
    if (targetId) where.targetId = targetId;
    if (q) where.OR = [{ actorEmail: { contains: q, mode: 'insensitive' } }, { action: { contains: q } }, { reason: { contains: q, mode: 'insensitive' } }];
    if (from || to) where.createdAt = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lt: new Date(to) } : {}) };
    const items = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > take;
    return { items: items.slice(0, take), nextCursor: hasMore ? items[take - 1].id : null };
  }
}
