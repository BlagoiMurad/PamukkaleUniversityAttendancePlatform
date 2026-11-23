import { createHmac } from 'crypto';

/**
 * AprilTag tag36h11 marker schedule (spec 16.1, 17.3, 19).
 *
 *   slot      = floor((server_now - marker_epoch) / rotation_ms)
 *   marker_id = HMAC-SHA256(session_secret, lesson_id || slot) mod 587
 *
 * The secret never leaves the server, so the sequence is unpredictable and differs per lesson.
 * The marker ID itself is NOT a secret (anyone in the room sees it); it is only a proof that the
 * student's camera looked at the current marker during the current 20-second window.
 */
export const TAG_FAMILY = 'tag36h11';
export const TAG36H11_COUNT = 587;
export const DEFAULT_ROTATION_SECONDS = 10;

export function slotIndex(epochMs: number, nowMs: number, rotationSeconds = DEFAULT_ROTATION_SECONDS): number {
  return Math.floor((nowMs - epochMs) / (rotationSeconds * 1000));
}

export function slotBounds(epochMs: number, slot: number, rotationSeconds = DEFAULT_ROTATION_SECONDS) {
  const len = rotationSeconds * 1000;
  return { start: epochMs + slot * len, end: epochMs + (slot + 1) * len };
}

function rawMarker(secret: string, lessonId: string, slot: number): number {
  const digest = createHmac('sha256', secret).update(`${lessonId}|${slot}`).digest();
  // 48 bits are plenty to make the modulo bias negligible (2^48 / 587).
  return digest.readUIntBE(0, 6) % TAG36H11_COUNT;
}

/** Marker for a slot. Guarantees the marker visibly changes at each boundary. */
export function markerFor(secret: string, lessonId: string, slot: number): number {
  const m = rawMarker(secret, lessonId, slot);
  if (slot > 0 && m === rawMarker(secret, lessonId, slot - 1)) return (m + 1) % TAG36H11_COUNT;
  return m;
}

export type MarkerCheck =
  | { ok: true; slot: number; graceUsed: boolean }
  | { ok: false; code: 'MARKER_EXPIRED' | 'MARKER_INVALID' };

/**
 * Validates a detected marker against the server clock.
 * - The current slot's marker is always accepted.
 * - The previous slot's marker is accepted only within `graceMs` after the boundary AND only when the
 *   attempt (challenge) was created before that boundary (spec 16.1, EC-20-01).
 * - A marker from one of the recent slots => MARKER_EXPIRED (EC-20-02), anything else => MARKER_INVALID.
 */
export function checkMarker(params: {
  secret: string;
  lessonId: string;
  epochMs: number;
  nowMs: number;
  markerId: number;
  graceMs: number;
  attemptStartedMs: number;
  rotationSeconds?: number;
}): MarkerCheck {
  const rot = params.rotationSeconds ?? DEFAULT_ROTATION_SECONDS;
  const slot = slotIndex(params.epochMs, params.nowMs, rot);
  if (slot < 0) return { ok: false, code: 'MARKER_INVALID' };
  if (markerFor(params.secret, params.lessonId, slot) === params.markerId) return { ok: true, slot, graceUsed: false };
  if (slot > 0 && markerFor(params.secret, params.lessonId, slot - 1) === params.markerId) {
    const boundary = slotBounds(params.epochMs, slot, rot).start;
    const withinGrace = params.nowMs - boundary <= params.graceMs;
    if (withinGrace && params.attemptStartedMs < boundary) return { ok: true, slot: slot - 1, graceUsed: true };
    return { ok: false, code: 'MARKER_EXPIRED' };
  }
  for (let back = 2; back <= 6 && slot - back >= 0; back++) {
    if (markerFor(params.secret, params.lessonId, slot - back) === params.markerId) return { ok: false, code: 'MARKER_EXPIRED' };
  }
  return { ok: false, code: 'MARKER_INVALID' };
}

/** PRESENT when verified_at <= started_at + lateAfter (exactly 10:00 is PRESENT), else LATE (spec 16.4). */
export function lateness(startedAtMs: number, verifiedAtMs: number, lateAfterSeconds: number) {
  const elapsed = verifiedAtMs - startedAtMs;
  return {
    status: elapsed <= lateAfterSeconds * 1000 ? ('PRESENT' as const) : ('LATE' as const),
    latenessSeconds: Math.max(0, Math.floor(elapsed / 1000)),
  };
}
