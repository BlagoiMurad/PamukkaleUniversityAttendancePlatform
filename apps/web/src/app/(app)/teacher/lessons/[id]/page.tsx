'use client';
import * as React from 'react';
import { use } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Clock, Download, Hand, History, Lock, MonitorPlay, MoreHorizontal, Play, Search, Square, UserMinus, UserX, Users, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, EmptyState, PageHeader, Spinner, Stat, Table, TBody, TD, TH, THead, TR } from '@/components/ui/misc';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AttendanceBadge, LessonBadge } from '@/components/status';
import { CorrectionDialog } from '@/components/teacher/correction-dialog';
import { api, download } from '@/lib/api';
import { useT, type MessageKey } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import { useFormat } from '@/lib/format';
import { useLessonSocket } from '@/lib/use-lesson-socket';
import { cn, uuid } from '@/lib/utils';

export default function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const fmt = useFormat();
  const qc = useQueryClient();
  const lesson = useQuery({ queryKey: ['lesson', id], queryFn: () => api(`/lessons/${id}`) });
  const roster = useQuery({ queryKey: ['roster', id], queryFn: () => api(`/lessons/${id}/attendance`), refetchInterval: lesson.data?.status === 'ACTIVE' ? 30_000 : false });
  const [filter, setFilter] = React.useState('');
  const [dialog, setDialog] = React.useState<{ mode: 'correct' | 'remove'; student: { id: string; name: string }; status?: string } | null>(null);
  const [historyFor, setHistoryFor] = React.useState<{ id: string; name: string } | null>(null);
  const [confirmEnd, setConfirmEnd] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<Set<string>>(new Set());

  const refresh = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ['roster', id] });
    qc.invalidateQueries({ queryKey: ['lesson', id] });
  }, [qc, id]);

  const connected = useLessonSocket(
    id,
    {
      'attendance.updated': (p: any) => {
        qc.invalidateQueries({ queryKey: ['roster', id] });
        if (p?.studentId) {
          setFlash((s) => new Set(s).add(p.studentId));
          setTimeout(() => setFlash((s) => { const n = new Set(s); n.delete(p.studentId); return n; }), 2500);
        }
      },
      'request.created': () => qc.invalidateQueries({ queryKey: ['roster', id] }),
      'session.started': refresh,
      'session.ended': refresh,
    },
    refresh,
  );

  const action = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    try {
      await fn();
      refresh();
    } catch (e) {
      toast.error(errorMessage(e, t));
    } finally {
      setBusy(null);
    }
  };

  if (lesson.isLoading) return <Spinner />;
  if (lesson.error) return <Alert variant="destructive">{errorMessage(lesson.error, t)}</Alert>;
  const l = lesson.data;
  const counts = roster.data?.counts;
  const lateAt = l.actualStartedAt && l.lateAfterSeconds != null ? new Date(new Date(l.actualStartedAt).getTime() + l.lateAfterSeconds * 1000) : null;
  const rows = (roster.data?.rows ?? []).filter((r: any) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return [r.student.name, r.student.email, r.student.studentProfile?.facultyNumber, r.student.universityId].some((v) => v?.toLowerCase().includes(q));
  });
  const requests = (roster.data?.rows ?? []).filter((r: any) => r.pendingRequest?.kind === 'MANUAL_CHECKIN' && !r.attendance);
  const canEdit = l.status === 'ACTIVE' || l.status === 'ENDED' || l.status === 'LOCKED';

  return (
    <div>
      <Link href={`/teacher/courses/${l.course.id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {l.course.code} · {l.course.title}</Link>
      <PageHeader
        eyebrow={<span className="flex items-center gap-2"><LessonBadge status={l.status} /> {fmt.weekday(l.startsAt)} · {fmt.time(l.startsAt)}–{fmt.time(l.scheduledEndAt)}{l.room ? ` · ${l.room}` : ''}</span>}
        title={l.title || l.course.title}
        description={
          l.actualStartedAt ? (
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              <span>{t('lesson.startedAt', { time: fmt.timeSec(l.actualStartedAt) })}</span>
              {lateAt && <span className="flex items-center gap-1"><Clock className="size-4" /> {t('lesson.lateAfter', { time: fmt.timeSec(lateAt) })}</span>}
            </span>
          ) : undefined
        }
        actions={
          <>
            {l.status === 'DRAFT' && (
              <Button loading={busy === 'start'} onClick={() => action('start', () => api(`/lessons/${id}/start`, { method: 'POST', idempotencyKey: uuid() }))}><Play /> {t('lesson.start')}</Button>
            )}
            {l.status === 'ACTIVE' && (
              <>
                <Button variant="outline" asChild><Link href={`/projector/${id}`} target="_blank"><MonitorPlay /> {t('lesson.projector')}</Link></Button>
                <Button variant="destructive" onClick={() => setConfirmEnd(true)}><Square /> {t('lesson.end')}</Button>
              </>
            )}
            {l.status === 'ENDED' && <Button variant="outline" loading={busy === 'lock'} onClick={() => action('lock', () => api(`/lessons/${id}/lock`, { method: 'POST' }))}><Lock /> {t('lesson.lock')}</Button>}
            {(l.status === 'ENDED' || l.status === 'LOCKED') && (
              <Button variant="outline" onClick={() => download(`/teacher/lessons/${id}/report.xlsx`, `lesson-${id}.xlsx`).catch((e) => toast.error(errorMessage(e, t)))}><Download /> Excel</Button>
            )}
          </>
        }
      />

      {l.status === 'ACTIVE' && (
        <Alert icon={MonitorPlay} className="mb-4">{t('lesson.projectorHint')}</Alert>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('status.PRESENT')} value={counts?.present ?? '–'} icon={CheckCircle2} tone="success" hint={counts ? `${t('teacher.students', { count: counts.total })}` : undefined} />
        <Stat label={t('status.LATE')} value={counts?.late ?? '–'} icon={Clock} tone="warning" />
        <Stat label={l.status === 'ACTIVE' ? t('lesson.notYet') : t('status.ABSENT')} value={counts ? (l.status === 'ACTIVE' ? counts.pending : counts.absent + counts.pending) : '–'} icon={XCircle} tone="destructive" />
        <Stat label={t('status.REMOVED_FROM_SESSION')} value={counts?.removed ?? '–'} icon={UserX} />
      </div>

      {requests.length > 0 && (
        <Card className="mb-4 border-primary/40">
          <CardHeader><CardTitle className="flex items-center gap-2"><Hand className="size-4 text-primary" /> {t('lesson.manualRequest')} ({requests.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {requests.map((r: any) => (
              <div key={r.student.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{r.student.name} <span className="text-sm text-muted-foreground">{r.student.studentProfile?.facultyNumber}</span></p>
                  <p className="text-sm text-muted-foreground">“{r.pendingRequest.reason}”</p>
                </div>
                <Button size="sm" variant="success" onClick={() => setDialog({ mode: 'correct', student: r.student, status: 'MANUAL_PRESENT' })}>{t('lesson.approve')}</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2"><Users className="size-4" /> {t('lesson.live')}</CardTitle>
          <div className="flex items-center gap-3 sm:shrink-0">
            {l.status === 'ACTIVE' && (
              <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex" aria-live="polite">
                <span className={cn('size-2 rounded-full', connected ? 'bg-success' : 'bg-warning')} /> {connected ? t('lesson.connected') : t('lesson.reconnecting')}
              </span>
            )}
            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('lesson.filter')} className="h-9 w-full pl-8 sm:w-64" aria-label={t('lesson.filter')} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          {roster.isLoading ? (
            <Spinner />
          ) : !rows.length ? (
            <div className="px-5"><EmptyState icon={Users} title={t('course.noStudents')} /></div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="pl-5">{t('common.name')}</TH>
                  <TH>{t('course.facultyNumber')}</TH>
                  <TH>{t('common.status')}</TH>
                  <TH>{t('lesson.checkedIn')}</TH>
                  <TH className="pr-5 text-right">{t('common.actions')}</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r: any) => (
                  <TR key={r.student.id} className={cn(flash.has(r.student.id) && 'bg-success/10')}>
                    <TD className="pl-5">
                      <p className="font-medium">{r.student.name}</p>
                      <p className="text-xs text-muted-foreground">{r.student.email}{r.enrollmentState === 'WITHDRAWN' ? ' · withdrawn' : ''}</p>
                    </TD>
                    <TD className="tabular text-muted-foreground">{r.student.studentProfile?.facultyNumber ?? '—'}{r.student.studentProfile?.group ? ` · ${r.student.studentProfile.group}` : ''}</TD>
                    <TD>
                      <div className="flex items-center gap-1.5">
                        <AttendanceBadge status={r.attendance?.status ?? (l.status === 'ACTIVE' || l.status === 'DRAFT' ? null : 'ABSENT')} />
                        {r.pendingRequest && !r.attendance && <Hand className="size-4 text-primary" aria-label={t('lesson.manualRequest')} />}
                      </div>
                    </TD>
                    <TD className="tabular text-sm text-muted-foreground">
                      {r.attendance?.verifiedAt ? fmt.timeSec(r.attendance.verifiedAt) : '—'}
                      {r.attendance?.evidenceType === 'MANUAL' && <span className="ml-1 text-xs">(manual)</span>}
                    </TD>
                    <TD className="pr-5">
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: 'correct', student: r.student, status: r.attendance?.status })}>{t('lesson.correct')}</Button>
                            {r.attendance?.status !== 'REMOVED_FROM_SESSION' && (
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDialog({ mode: 'remove', student: r.student })} aria-label={t('common.remove')}><UserMinus /></Button>
                            )}
                          </>
                        )}
                        {r.attendance && <Button size="sm" variant="ghost" onClick={() => setHistoryFor(r.student)} aria-label={t('lesson.history')}><History /></Button>}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CorrectionDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} lessonId={id} student={dialog?.student ?? null} mode={dialog?.mode ?? 'correct'} initialStatus={dialog?.status} onDone={refresh} />

      <Dialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <DialogContent title={t('lesson.end')} description={t('lesson.endConfirm')}>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmEnd(false)}>{t('common.cancel')}</Button>
            <Button variant="destructive" loading={busy === 'end'} onClick={() => action('end', () => api(`/lessons/${id}/end`, { method: 'POST' })).then(() => setConfirmEnd(false))}>{t('lesson.end')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <HistoryDialog lessonId={id} student={historyFor} onClose={() => setHistoryFor(null)} />
    </div>
  );
}

function HistoryDialog({ lessonId, student, onClose }: { lessonId: string; student: { id: string; name: string } | null; onClose: () => void }) {
  const t = useT();
  const fmt = useFormat();
  const q = useQuery({ queryKey: ['history', lessonId, student?.id], queryFn: () => api(`/lessons/${lessonId}/attendance/${student!.id}/history`), enabled: !!student });
  return (
    <Dialog open={!!student} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`${t('lesson.history')} · ${student?.name ?? ''}`}>
        {q.isLoading ? (
          <Spinner />
        ) : (
          <ol className="relative space-y-4 border-l pl-5">
            {(q.data?.events ?? []).map((e: any) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[26px] top-1 size-3 rounded-full border-2 border-card bg-primary" />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{e.action.replaceAll('_', ' ').toLowerCase()}</span>
                  {e.oldStatus && <AttendanceBadge status={e.oldStatus} />}
                  {e.oldStatus && '→'}
                  {e.newStatus && <AttendanceBadge status={e.newStatus} />}
                </div>
                <p className="text-xs text-muted-foreground">{fmt.dateTime(e.createdAt)} · {e.actor?.name ?? 'System'}</p>
                {e.reason && <p className="mt-1 text-sm">“{e.reason}”</p>}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
