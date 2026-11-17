import { Injectable } from '@nestjs/common';

/**
 * Single source of server time. Attendance status is ALWAYS derived from this clock,
 * never from the client (spec 4.3, 18.4). Tests replace it to exercise exact boundaries.
 */
@Injectable()
export class ClockService {
  private offsetMs = 0;
  private frozen: number | null = null;

  nowMs(): number {
    return this.frozen ?? Date.now() + this.offsetMs;
  }

  now(): Date {
    return new Date(this.nowMs());
  }

  /** Test helpers */
  freeze(at: Date | number) {
    this.frozen = typeof at === 'number' ? at : at.getTime();
  }
  advance(ms: number) {
    if (this.frozen !== null) this.frozen += ms;
    else this.offsetMs += ms;
  }
  reset() {
    this.frozen = null;
    this.offsetMs = 0;
  }
}
