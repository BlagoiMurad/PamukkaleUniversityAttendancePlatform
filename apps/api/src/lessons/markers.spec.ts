import { checkMarker, lateness, markerFor, slotBounds, slotIndex, TAG36H11_COUNT } from './markers';

const secret = 'a'.repeat(43);
const lessonId = '00000000-0000-4000-8000-000000000001';
const epoch = Date.UTC(2026, 10, 17, 8, 0, 0);

describe('marker slots (BE-20-03)', () => {
  it('uses exact 20 000 ms slots: 19.999 s / 20.000 s / 22.000 s', () => {
    expect(slotIndex(epoch, epoch + 19_999)).toBe(0);
    expect(slotIndex(epoch, epoch + 20_000)).toBe(1);
    expect(slotIndex(epoch, epoch + 22_000)).toBe(1);
    expect(slotBounds(epoch, 1)).toEqual({ start: epoch + 20_000, end: epoch + 40_000 });
  });

  it('derives IDs in range, deterministic per lesson and different across lessons', () => {
    const seq = Array.from({ length: 50 }, (_, i) => markerFor(secret, lessonId, i));
    seq.forEach((m) => expect(m).toBeGreaterThanOrEqual(0));
    seq.forEach((m) => expect(m).toBeLessThan(TAG36H11_COUNT));
    expect(seq).toEqual(Array.from({ length: 50 }, (_, i) => markerFor(secret, lessonId, i)));
    const other = Array.from({ length: 50 }, (_, i) => markerFor(secret, '00000000-0000-4000-8000-000000000002', i));
    expect(other).not.toEqual(seq);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
  });

  const base = { secret, lessonId, epochMs: epoch, graceMs: 2000 };

  it('accepts the current marker', () => {
    const now = epoch + 25_000;
    const r = checkMarker({ ...base, nowMs: now, markerId: markerFor(secret, lessonId, 1), attemptStartedMs: now - 1000 });
    expect(r).toEqual({ ok: true, slot: 1, graceUsed: false });
  });

  it('EC-20-01: previous marker accepted only within 2 s and when the attempt began before the boundary', () => {
    const prev = markerFor(secret, lessonId, 0);
    expect(checkMarker({ ...base, nowMs: epoch + 21_000, markerId: prev, attemptStartedMs: epoch + 19_000 })).toEqual({ ok: true, slot: 0, graceUsed: true });
    expect(checkMarker({ ...base, nowMs: epoch + 22_000, markerId: prev, attemptStartedMs: epoch + 19_000 }).ok).toBe(true);
    expect(checkMarker({ ...base, nowMs: epoch + 22_001, markerId: prev, attemptStartedMs: epoch + 19_000 })).toEqual({ ok: false, code: 'MARKER_EXPIRED' });
    // attempt started after the boundary => no grace
    expect(checkMarker({ ...base, nowMs: epoch + 21_000, markerId: prev, attemptStartedMs: epoch + 20_500 })).toEqual({ ok: false, code: 'MARKER_EXPIRED' });
    // grace disabled
    expect(checkMarker({ ...base, graceMs: 0, nowMs: epoch + 20_500, markerId: prev, attemptStartedMs: epoch + 19_000 }).ok).toBe(false);
  });

  it('EC-20-02: an older marker is MARKER_EXPIRED, a random one MARKER_INVALID', () => {
    const now = epoch + 85_000; // slot 4
    expect(checkMarker({ ...base, nowMs: now, markerId: markerFor(secret, lessonId, 2), attemptStartedMs: now })).toEqual({ ok: false, code: 'MARKER_EXPIRED' });
    const used = new Set(Array.from({ length: 8 }, (_, i) => markerFor(secret, lessonId, i)));
    const random = [...Array(TAG36H11_COUNT).keys()].find((i) => !used.has(i))!;
    expect(checkMarker({ ...base, nowMs: now, markerId: random, attemptStartedMs: now })).toEqual({ ok: false, code: 'MARKER_INVALID' });
  });
});

describe('late rule (E2E-03)', () => {
  const start = epoch;
  it('exactly 10:00 is PRESENT, 10:00.001 is LATE', () => {
    expect(lateness(start, start + 600_000, 600).status).toBe('PRESENT');
    expect(lateness(start, start + 600_001, 600).status).toBe('LATE');
    expect(lateness(start, start + 601_000, 600)).toEqual({ status: 'LATE', latenessSeconds: 601 });
    expect(lateness(start, start + 5_000, 600)).toEqual({ status: 'PRESENT', latenessSeconds: 5 });
  });
});
