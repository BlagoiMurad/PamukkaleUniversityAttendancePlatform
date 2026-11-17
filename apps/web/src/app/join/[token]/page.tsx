'use client';
import * as React from 'react';
import { use } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Camera, CameraOff, CheckCircle2, Clock, Flashlight, Hand, Loader2, ScanLine, ShieldCheck, WifiOff, XCircle } from 'lucide-react';
import { Logo } from '@/components/brand';
import { LanguageSwitch } from '@/components/language-switch';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, Spinner } from '@/components/ui/misc';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { RequireAuth, homeFor } from '@/lib/auth';
import { useT, type MessageKey } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import { useFormat } from '@/lib/format';
import { useAprilTagScanner, type Detection } from '@/lib/use-apriltag-scanner';
import { useLessonSocket } from '@/lib/use-lesson-socket';
import { cn, uuid } from '@/lib/utils';

interface JoinContext {
  lesson: { id: string; title: string | null; room: string | null; status: string; startsAt: string; actualStartedAt: string | null; lateAfterSeconds: number | null };
  course: { id: string; code: string; title: string };
  teacher: { name: string };
  canCheckIn: boolean;
  reason: string | null;
  attendance: { status: string; verifiedAt: string | null } | null;
  manualCheckin?: { allowed: boolean; pending: { id: string } | null };
}

type Phase =
  | { kind: 'ready' }
  | { kind: 'scanning'; hint?: MessageKey; detected?: number }
  | { kind: 'verifying'; markerId: number }
  | { kind: 'success'; status: string; verifiedAt: string | null; already?: boolean }
  | { kind: 'blocked'; code: string };

const BLOCKING = new Set(['LESSON_ENDED', 'LESSON_NOT_STARTED', 'STUDENT_NOT_ENROLLED', 'ENROLLMENT_REVOKED', 'STUDENT_REMOVED', 'CHECKIN_CLOSED', 'JOIN_TOKEN_INVALID', 'SESSION_REVOKED', 'FORBIDDEN']);

function Join({ token }: { token: string }) {
  const t = useT();
  const fmt = useFormat();
  const qc = useQueryClient();
  const ctx = useQuery<JoinContext, ApiError>({ queryKey: ['join', token], queryFn: () => api(`/join/${token}/context`), retry: false });
  const [phase, setPhase] = React.useState<Phase>({ kind: 'ready' });
  const [netError, setNetError] = React.useState<string | null>(null);
  const challengeRef = React.useRef<{ id: string; expiresAt: number } | null>(null);
  const inflight = React.useRef(false);
  const rejected = React.useRef(new Map<number, number>()); // markerId -> until (ms)
  const lessonId = ctx.data?.lesson.id;

  const scanner = useAprilTagScanner((markers) => handleDetections(markers));

  const finish = React.useCallback(
    (p: Phase) => {
      scanner.stop();
      setPhase(p);
      if (p.kind === 'success') {
        navigator.vibrate?.(120);
        qc.invalidateQueries({ queryKey: ['join', token] });
      }
    },
    [scanner, qc, token],
  );

  useLessonSocket(lessonId, {
    'lesson.ended': () => {
      if (phase.kind !== 'success') finish({ kind: 'blocked', code: 'LESSON_ENDED' });
    },
    'attendance.updated': () => ctx.refetch(),
  });

  const newChallenge = React.useCallback(async () => {
    const r = await api(`/lessons/${lessonId}/attendance-challenges`, { body: { joinToken: token } });
    if (r.alreadyRecorded) {
      finish({ kind: 'success', status: r.attendance.status, verifiedAt: r.attendance.verifiedAt, already: true });
      return null;
    }
    challengeRef.current = { id: r.challengeId, expiresAt: Date.now() + (new Date(r.expiresAt).getTime() - new Date(r.serverNow).getTime()) };
    return challengeRef.current;
  }, [lessonId, token, finish]);

  async function verify(markerId: number) {
    inflight.current = true;
    setPhase({ kind: 'verifying', markerId });
    try {
      let ch = challengeRef.current;
      if (!ch || ch.expiresAt - Date.now() < 3000) ch = await newChallenge();
      if (!ch) return;
      const key = `${ch.id}:${markerId}`;
      let attempt = 0;
      // Retry network failures with the SAME idempotency key; never claim success without a server ACK (spec 9, 19.3)
      for (;;) {
        try {
          const res = await api(`/lessons/${lessonId}/attendance/verify`, { body: { challengeId: ch.id, markerFamily: 'tag36h11', markerId }, idempotencyKey: key, timeoutMs: 8000 });
          setNetError(null);
          finish({ kind: 'success', status: res.status, verifiedAt: res.verifiedAt, already: res.alreadyRecorded });
          return;
        } catch (e) {
          if (e instanceof ApiError && (e.code === 'NETWORK_OFFLINE' || e.code === 'SERVER_TIMEOUT') && attempt < 4) {
            attempt++;
            setNetError(t(`err.${e.code}` as MessageKey));
            await new Promise((r) => setTimeout(r, 600 * attempt));
            continue;
          }
          throw e;
        }
      }
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'generic';
      if (BLOCKING.has(code)) return finish({ kind: 'blocked', code });
      if (code === 'CHALLENGE_EXPIRED' || code === 'CHALLENGE_REVOKED' || code === 'CHALLENGE_USED' || code === 'CHALLENGE_ATTEMPTS_EXCEEDED' || code === 'CHALLENGE_NOT_FOUND') {
        challengeRef.current = null;
        setPhase({ kind: 'scanning', hint: 'err.CHALLENGE_EXPIRED' });
      } else if (code === 'MARKER_EXPIRED') {
        rejected.current.set(markerId, Date.now() + 25_000);
        setPhase({ kind: 'scanning', hint: 'join.markerChanged' });
      } else if (code === 'MARKER_INVALID') {
        rejected.current.set(markerId, Date.now() + 25_000);
        setPhase({ kind: 'scanning', hint: 'err.MARKER_INVALID' });
      } else {
        setNetError(errorMessage(e, t));
        setPhase({ kind: 'scanning' });
      }
    } finally {
      inflight.current = false;
    }
  }

  function handleDetections(markers: Detection[]) {
    if (inflight.current || !markers.length) return;
    const now = Date.now();
    const candidate = markers
      .filter((m) => m.hammingDistance <= 2 && !((rejected.current.get(m.id) ?? 0) > now))
      .sort((a, b) => a.hammingDistance - b.hammingDistance)[0];
    if (candidate) verify(candidate.id);
  }

  async function startScan() {
    setNetError(null);
    rejected.current.clear();
    setPhase({ kind: 'scanning' });
    try {
      const ch = await newChallenge();
      if (!ch) return;
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'generic';
      if (BLOCKING.has(code)) return finish({ kind: 'blocked', code });
      setNetError(errorMessage(e, t));
      setPhase({ kind: 'ready' });
      return;
    }
    const ok = await scanner.start();
    if (!ok) setPhase({ kind: 'ready' });
  }

  if (ctx.isLoading) return <Spinner className="py-24" />;
  if (ctx.error) {
    return <StatusCard tone="destructive" icon={XCircle} title={t('join.title')} message={errorMessage(ctx.error, t)} />;
  }
  const c = ctx.data!;
  const lateAt = c.lesson.actualStartedAt && c.lesson.lateAfterSeconds != null ? new Date(new Date(c.lesson.actualStartedAt).getTime() + c.lesson.lateAfterSeconds * 1000) : null;

  const header = (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-r from-[hsl(186_75%_24%)] to-[hsl(190_70%_40%)] px-5 py-4 text-white">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-md bg-white/15 px-2 py-0.5 text-xs font-bold ring-1 ring-white/25">{c.course.code}</span>
          <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold ring-1 ring-white/25">{t(`lesson.${c.lesson.status}` as MessageKey)}</span>
        </div>
        <h1 className="mt-2 text-xl font-bold leading-tight">{c.course.title}</h1>
        <p className="text-sm text-white/80">{c.teacher.name}{c.lesson.room ? ` · ${c.lesson.room}` : ''}</p>
      </div>
      {lateAt && (
        <CardContent className="flex items-center gap-2 pt-3 text-sm text-muted-foreground">
          <Clock className="size-4" /> {t('lesson.lateAfter', { time: fmt.time(lateAt) })}
        </CardContent>
      )}
    </Card>
  );

  // Server says the student cannot check in (ended, not enrolled, removed, already recorded…)
  const serverBlock = !c.canCheckIn && phase.kind !== 'success' ? c.reason : null;
  if (serverBlock === 'NOT_A_STUDENT') {
    return (
      <Shell>
        {header}
        <Alert variant="warning" icon={AlertTriangle}>{t('join.notStudent', { role: '' })}</Alert>
      </Shell>
    );
  }
  if (serverBlock === 'ALREADY_RECORDED' && c.attendance) return <Shell>{header}<Result status={c.attendance.status} verifiedAt={c.attendance.verifiedAt} already /></Shell>;
  const blocked = phase.kind === 'blocked' ? phase.code : serverBlock;

  return (
    <Shell>
      {header}
      <Steps phase={phase.kind} />
      {blocked ? (
        <StatusCard tone="destructive" icon={XCircle} title={t('join.title')} message={t(`err.${blocked}` as MessageKey)} />
      ) : phase.kind === 'success' ? (
        <Result status={phase.status} verifiedAt={phase.verifiedAt} already={phase.already} />
      ) : (
        <>
          <div className={cn('relative overflow-hidden rounded-2xl bg-black shadow-lg', scanner.state === 'running' || scanner.state === 'starting' ? 'aspect-[3/4] sm:aspect-video' : 'hidden')}>
            <video ref={scanner.videoRef} className="size-full object-cover" playsInline muted aria-label={t('join.pointCamera')} />
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="relative size-[62%] max-w-[340px] rounded-2xl border-4 border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,.35)]">
                <div className="absolute inset-x-3 top-1/2 h-0.5 animate-scan-line bg-[hsl(182_80%_55%)] shadow-[0_0_12px_hsl(182_80%_55%)]" />
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent p-4 text-white">
              <p className="text-sm font-medium" aria-live="polite">
                {phase.kind === 'verifying' ? (
                  <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> {t('join.detected', { id: phase.markerId })}</span>
                ) : phase.kind === 'scanning' && phase.hint ? (
                  t(phase.hint)
                ) : (
                  t('join.pointCamera')
                )}
              </p>
              <div className="flex gap-1">
                {scanner.torch.supported && (
                  <Button size="icon" variant="ghost" className="text-white hover:bg-white/20" onClick={scanner.toggleTorch} aria-label={t('join.torch')}><Flashlight /></Button>
                )}
                <Button size="sm" variant="ghost" className="text-white hover:bg-white/20" onClick={() => { scanner.stop(); setPhase({ kind: 'ready' }); }}>{t('join.stop')}</Button>
              </div>
            </div>
          </div>

          {scanner.state !== 'running' && scanner.state !== 'starting' && (
            <div className="space-y-4">
              <Button size="xl" className="h-16 w-full text-lg" onClick={startScan} loading={phase.kind === 'scanning' && scanner.state === 'idle'}>
                <ScanLine className="!size-6" /> {t('join.scanButton')}
              </Button>
              <p className="flex gap-2 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /> {t('join.cameraWhy')}</p>
            </div>
          )}
          {scanner.state === 'running' && <p className="text-center text-xs text-muted-foreground">{t('join.zoomTip')}</p>}
          {scanner.error && <Alert variant="destructive" icon={CameraOff}>{t(`err.${scanner.error}` as MessageKey)}</Alert>}
          {netError && <Alert variant="warning" icon={WifiOff}>{netError}</Alert>}
          {c.manualCheckin?.allowed && <ManualRequest lessonId={c.lesson.id} token={token} pending={!!c.manualCheckin.pending} highlight={!!scanner.error} />}
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-hero min-h-dvh">
      <header className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
        <Logo />
        <LanguageSwitch />
      </header>
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-10 animate-fade-in">{children}</main>
    </div>
  );
}

function Steps({ phase }: { phase: Phase['kind'] }) {
  const t = useT();
  const idx = phase === 'success' ? 3 : phase === 'scanning' || phase === 'verifying' ? 1 : 0;
  const steps: MessageKey[] = ['join.step1', 'join.step2', 'join.step3'];
  return (
    <ol className="grid grid-cols-3 gap-2 text-center text-xs font-medium">
      {steps.map((s, i) => (
        <li key={s} className={cn('rounded-lg border px-2 py-2', i < idx ? 'border-success/30 bg-success/10 text-success' : i === idx ? 'border-primary/40 bg-primary/10 text-primary' : 'text-muted-foreground')}>
          {i + 1}. {t(s)}
        </li>
      ))}
    </ol>
  );
}

function Result({ status, verifiedAt, already }: { status: string; verifiedAt: string | null; already?: boolean }) {
  const t = useT();
  const fmt = useFormat();
  const late = status === 'LATE' || status === 'MANUAL_LATE';
  const removed = status === 'REMOVED_FROM_SESSION';
  if (removed) return <StatusCard tone="destructive" icon={XCircle} title={t('status.REMOVED_FROM_SESSION')} message={t('err.STUDENT_REMOVED')} />;
  return (
    <Card className={cn('border-2 text-center', late ? 'border-warning/50' : 'border-success/50')}>
      <CardContent className="flex flex-col items-center gap-3 p-8">
        <div className={cn('grid size-20 place-items-center rounded-full', late ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success')}>
          {late ? <Clock className="size-10" /> : <CheckCircle2 className="size-10" />}
        </div>
        <p className="text-2xl font-bold" role="status">{t(late ? 'join.successLATE' : 'join.successPRESENT')}</p>
        <p className="text-lg font-semibold">{t(`status.${status}` as MessageKey)}</p>
        {verifiedAt && <p className="text-muted-foreground">{t('join.verifiedAt', { time: fmt.timeSec(verifiedAt) })}</p>}
        {already && <p className="text-sm text-muted-foreground">{t('join.already')}</p>}
        <Button variant="outline" asChild className="mt-2"><Link href="/student">{t('join.goHome')}</Link></Button>
      </CardContent>
    </Card>
  );
}

function StatusCard({ tone, icon: Icon, title, message }: { tone: 'destructive' | 'warning'; icon: any; title: string; message: string }) {
  const t = useT();
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
        <div className={cn('grid size-16 place-items-center rounded-full', tone === 'destructive' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning')}>
          <Icon className="size-8" />
        </div>
        <p className="text-lg font-semibold">{title}</p>
        <p className="text-muted-foreground">{message}</p>
        <Button variant="outline" asChild><Link href="/">{t('join.goHome')}</Link></Button>
      </CardContent>
    </Card>
  );
}

function ManualRequest({ lessonId, token, pending, highlight }: { lessonId: string; token: string; pending: boolean; highlight: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(pending);
  if (sent) return <Alert variant="success" icon={Hand}>{t('join.manualSent')}</Alert>;
  return (
    <div className={cn('rounded-xl border p-4', highlight && 'border-primary/40 bg-primary/5')}>
      <p className="flex items-center gap-2 text-sm font-medium"><Camera className="size-4" /> {t('join.noCamera')}</p>
      <Button variant="link" className="h-auto px-0" onClick={() => setOpen(true)}>{t('join.manualRequest')}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t('join.manualRequest')}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('join.manualReason')} maxLength={500} />
          {err && <Alert variant="destructive">{err}</Alert>}
          <Button
            loading={busy}
            disabled={reason.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await api(`/lessons/${lessonId}/manual-checkin-requests`, { body: { joinToken: token, reason } });
                setSent(true);
                setOpen(false);
                qc.invalidateQueries({ queryKey: ['join', token] });
              } catch (e) {
                setErr(errorMessage(e, t));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('common.confirm')}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return <RequireAuth>{(me) => (me.user.role === 'STUDENT' ? <Join token={token} /> : <NotStudent role={me.user.role} />)}</RequireAuth>;
}

function NotStudent({ role }: { role: 'ADMIN' | 'TEACHER' | 'STUDENT' }) {
  const t = useT();
  return (
    <Shell>
      <Alert variant="warning" icon={AlertTriangle}>{t('join.notStudent', { role: t(`role.${role}` as MessageKey) })}</Alert>
      <Button asChild><Link href={homeFor(role)}>{t('join.goHome')}</Link></Button>
    </Shell>
  );
}
