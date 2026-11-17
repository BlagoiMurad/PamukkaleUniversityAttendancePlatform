import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { ClockService } from '../common/clock.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly clock: ClockService) {}

  @Public()
  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', serverNow: this.clock.now().toISOString() };
  }

  /** Lightweight clock endpoint used by projector/scanner to compute their offset to server time. */
  @Public()
  @Get('time')
  time() {
    return { serverNow: this.clock.now().toISOString() };
  }
}
