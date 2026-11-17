'use client';
import * as React from 'react';

/** Estimates server clock offset (spec 16.8 FE-20-03: sync with server_now). */
export function useServerClock() {
  const offset = React.useRef(0);
  const [synced, setSynced] = React.useState(false);
  const sync = React.useCallback(async () => {
    let best: { rtt: number; off: number } | null = null;
    for (let i = 0; i < 3; i++) {
      const t0 = Date.now();
      try {
        const r = await fetch('/api/health/time', { cache: 'no-store' });
        const { serverNow } = await r.json();
        const t1 = Date.now();
        const rtt = t1 - t0;
        const off = new Date(serverNow).getTime() - (t0 + rtt / 2);
        if (!best || rtt < best.rtt) best = { rtt, off };
      } catch {}
    }
    if (best) {
      offset.current = best.off;
      setSynced(true);
    }
  }, []);
  React.useEffect(() => {
    sync();
    const id = setInterval(sync, 60_000);
    return () => clearInterval(id);
  }, [sync]);
  const now = React.useCallback(() => Date.now() + offset.current, []);
  return { now, synced, sync };
}

export function useTicker(ms = 250) {
  const [, setN] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}
