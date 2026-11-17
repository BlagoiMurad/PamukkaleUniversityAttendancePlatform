'use client';
import * as React from 'react';
import { use } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Expand, Users, WifiOff, X } from 'lucide-react';
import { AprilTag } from '@/components/apriltag';
import { QrCode } from '@/components/qr-code';
import { LessonBadge } from '@/components/status';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { RequireAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { useFormat } from '@/lib/format';
import { useServerClock, useTicker } from '@/lib/use-server-clock';
import { useLessonSocket } from '@/lib/use-lesson-socket';
import { cn } from '@/lib/utils';

interface DisplayState {
  lessonId: string;
  status: string;
  course: { code: string; title: string };
  title: string | null;
  room: string | null;
  actualStartedAt: string | null;
  lateAfterSeconds: number | null;
  serverNow: string;
  rotationSeconds: number;
  joinUrl: string | null;
  marker: { family: string; id: number; slot: number } | null;
  slotStartAt: string | null;
  slotEndAt: string | null;
}

const STALE_AFTER_MS = 2000; // never show a marker as valid beyond the server grace window

function Projector({ id }: { id: string }) {
  const t = useT();
  const fmt = useFormat();
  const qc = useQueryClient();
  const clock = useServerClock();
  useTicker(200);
  const [state, setState] = React.useState<DisplayState | null>(null);
  const [error, setError] = React.useState(false);
  const fetching = React.useRef(false);

  const refresh = React.useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const s = await api<DisplayState>(`/lessons/${id}/display-state`);
      setState(s);
      setError(false);
    } catch {
      setError(true);
    } finally {
      fetching.current = false;
    }
  }, [id]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const roster = useQuery({ queryKey: ['roster', id], queryFn: () => api(`/lessons/${id}/attendance`), refetchInterval: 15_000 });

  const connected = useLessonSocket(
    id,
    {
      'marker.rotated': (s: DisplayState) => s.lessonId === id && setState(s),
      'attendance.updated': () => qc.invalidateQueries({ queryKey: ['roster', id] }),
      'session.ended': () => refresh(),
    },
    refresh,
  );

  // Refetch exactly at the boundary in case the push is late (FE-20-03)
  const now = clock.now();
  const slotEnd = state?.slotEndAt ? new Date(state.slotEndAt).getTime() : null;
  const remainingMs = slotEnd ? slotEnd - now : 0;
  React.useEffect(() => {
    if (slotEnd && remainingMs <= 0) refresh();
  }, [slotEnd, remainingMs <= 0, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the projector awake
  React.useEffect(() => {
    let lock: any;
    (navigator as any).wakeLock?.request('screen').then((l: any) => (lock = l)).catch(() => undefined);
    return () => lock?.release?.();
  }, []);

  const toggleFullscreen = React.useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }, []);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key.toLowerCase() === 'f' && toggleFullscreen();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleFullscreen]);

  if (!state) return error ? <Unavailable t={t} /> : <Spinner className="min-h-dvh" />;

  const stale = remainingMs < -STALE_AFTER_MS || error || (!connected && remainingMs < 0);
  const rot = state.rotationSeconds * 1000;
  const secondsLeft = Math.max(0, Math.ceil(remainingMs / 1000));
  const progress = Math.max(0, Math.min(1, remainingMs / rot));
  const lateAt = state.actualStartedAt && state.lateAfterSeconds != null ? new Date(new Date(state.actualStartedAt).getTime() + state.lateAfterSeconds * 1000) : null;
  const checked = roster.data ? roster.data.counts.present + roster.data.counts.late : null;

  return (
    <div className="flex min-h-dvh flex-col bg-white text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-8 py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-[hsl(184_84%_32%)] px-2.5 py-1 text-sm font-bold text-white">{state.course.code}</span>
            <LessonBadge status={state.status} />
          </div>
          <h1 className="mt-1 truncate text-3xl font-bold tracking-tight">{state.course.title}{state.title ? ` · ${state.title}` : ''}</h1>
        </div>
        <div className="flex items-center gap-6 text-lg">
          {lateAt && (
            <div className="flex items-center gap-2 text-slate-600"><Clock className="size-5" /> {t('projector.late', { time: fmt.time(lateAt) })}</div>
          )}
          {checked != null && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 font-semibold text-emerald-700">
              <Users className="size-5" /> <span className="tabular">{checked} / {roster.data.counts.total}</span> {t('projector.checkedIn')}
            </div>
          )}
          <div className="flex gap-1 print:hidden">
            <Button variant="ghost" size="icon" onClick={toggleFullscreen} aria-label={t('projector.fullscreen')} className="text-slate-600 hover:bg-slate-100"><Expand /></Button>
            <Button variant="ghost" size="icon" asChild className="text-slate-600 hover:bg-slate-100"><Link href={`/teacher/lessons/${id}`} aria-label={t('projector.exit')}><X /></Link></Button>
          </div>
        </div>
      </header>

      {state.status !== 'ACTIVE' ? (
        <div className="grid flex-1 place-items-center p-10 text-center">
          <div>
            <p className="text-4xl font-bold">{state.status === 'DRAFT' ? t('projector.notStarted') : t('projector.ended')}</p>
            {checked != null && <p className="mt-3 text-xl text-slate-500">{checked} / {roster.data.counts.total} {t('projector.checkedIn')}</p>}
          </div>
        </div>
      ) : (
        <div className="grid flex-1 items-center gap-10 px-8 py-8 lg:grid-cols-2">
          <section className="flex flex-col items-center gap-5 text-center">
            <div className="flex items-center gap-3 text-2xl font-semibold"><Step n={1} /> {t('projector.scanQr')}</div>
            <QrCode value={state.joinUrl!} className="w-[min(38vw,58vh)] max-w-[560px] [&_svg]:h-auto [&_svg]:w-full" />
            <p className="max-w-md break-all font-mono text-sm text-slate-500">{state.joinUrl}</p>
          </section>

          <section className="relative flex flex-col items-center gap-5 text-center">
            <div className="flex items-center gap-3 text-2xl font-semibold"><Step n={2} /> {t('projector.thenTag')}</div>
            <div className={cn('relative bg-white p-[2.5vh]', stale && 'opacity-0')} aria-live="off">
              {state.marker && <AprilTag id={state.marker.id} className="block w-[min(38vw,58vh)] max-w-[560px]" />}
            </div>
            {stale ? (
              <div className="absolute inset-x-0 top-1/4 mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border-2 border-amber-400 bg-amber-50 p-8 text-amber-900">
                <WifiOff className="size-10" />
                <p className="text-2xl font-bold">{t('projector.unavailable')}</p>
                <p>{t('projector.unavailableHint')}</p>
              </div>
            ) : (
              <div className="w-[min(38vw,58vh)] max-w-[560px]">
                <div className="mb-2 flex items-baseline justify-between text-slate-600">
                  <span className="text-lg">{t('projector.nextIn')}</span>
                  <span className="tabular text-4xl font-bold text-slate-900">{secondsLeft}s</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-[hsl(184_84%_32%)]" style={{ width: `${progress * 100}%` }} />
                </div>
              </div>
            )}
          </section>
        </div>
      )}
      <footer className="flex items-center justify-between px-8 pb-4 text-sm text-slate-400">
        <span>AprilTag 36h11 · {state.rotationSeconds}s</span>
        <span className="flex items-center gap-2">
          <span className={cn('size-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-amber-500')} /> {connected ? t('lesson.connected') : t('lesson.reconnecting')}
        </span>
      </footer>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return <span className="grid size-10 place-items-center rounded-full bg-slate-900 text-xl font-bold text-white">{n}</span>;
}

function Unavailable({ t }: { t: ReturnType<typeof useT> }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-white p-10 text-center text-slate-900">
      <div className="flex flex-col items-center gap-3">
        <WifiOff className="size-12 text-amber-500" />
        <p className="text-3xl font-bold">{t('projector.unavailable')}</p>
        <p className="text-slate-500">{t('projector.unavailableHint')}</p>
      </div>
    </div>
  );
}

export default function ProjectorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <RequireAuth roles={['TEACHER', 'ADMIN']}>{() => <Projector id={id} />}</RequireAuth>;
}
