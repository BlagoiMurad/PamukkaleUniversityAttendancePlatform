'use client';
import * as React from 'react';
import { useI18n } from './i18n';
import { useMe } from './auth';

/** Formats instants in the university time zone (storage is UTC, spec 9 / 22.3). */
export function useFormat() {
  const { locale } = useI18n();
  const me = useMe();
  const timeZone = me.data?.settings?.universityTimeZone ?? 'Europe/Istanbul';
  const loc = locale === 'bg' ? 'bg-BG' : 'en-GB';
  return React.useMemo(() => {
    const mk = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(loc, { timeZone, ...o });
    const time = mk({ hour: '2-digit', minute: '2-digit' });
    const timeSec = mk({ hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const date = mk({ day: '2-digit', month: 'short', year: 'numeric' });
    const dateTime = mk({ day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const weekday = mk({ weekday: 'short', day: '2-digit', month: 'short' });
    const f = (fmt: Intl.DateTimeFormat) => (v?: string | Date | null) => (v ? fmt.format(new Date(v)) : '—');
    const rel = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' });
    return {
      timeZone,
      time: f(time),
      timeSec: f(timeSec),
      date: f(date),
      dateTime: f(dateTime),
      weekday: f(weekday),
      relative(v?: string | Date | null) {
        if (!v) return '—';
        const diff = (new Date(v).getTime() - Date.now()) / 1000;
        const abs = Math.abs(diff);
        if (abs < 60) return rel.format(Math.round(diff), 'second');
        if (abs < 3600) return rel.format(Math.round(diff / 60), 'minute');
        if (abs < 86400) return rel.format(Math.round(diff / 3600), 'hour');
        return rel.format(Math.round(diff / 86400), 'day');
      },
      /** yyyy-mm-ddThh:mm in the university zone for <input type="datetime-local"> */
      toLocalInput(v: Date) {
        const parts = Object.fromEntries(
          new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
            .formatToParts(v)
            .map((p) => [p.type, p.value]),
        );
        return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
      },
      /** Interprets a datetime-local value as university-zone wall time and returns a UTC Date. */
      fromLocalInput(value: string) {
        const guess = new Date(value + 'Z');
        const offset = tzOffsetMs(guess, timeZone);
        return new Date(guess.getTime() - offset);
      },
    };
  }, [loc, timeZone]);
}

function tzOffsetMs(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUTC - date.getTime();
}
