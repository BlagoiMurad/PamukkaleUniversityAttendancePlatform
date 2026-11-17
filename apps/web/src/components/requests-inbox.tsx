'use client';
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight, Check, Lock, CheckCircle2, Clock, Hand, Inbox, MessageSquareWarning, PenLine, X, XCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Textarea } from './ui/input';
import { EmptyState, Spinner } from './ui/misc';
import { Dialog, DialogContent } from './ui/dialog';
import { AttendanceBadge } from './status';
import { api } from '@/lib/api';
import { useT, type MessageKey } from '@/lib/i18n';
import { useFormat } from '@/lib/format';
import { errorMessage } from '@/lib/errors';
import { cn, initials } from '@/lib/utils';

const KIND_ICON: Record<string, any> = { STUDENT_DISPUTE: MessageSquareWarning, MANUAL_CHECKIN: Hand, TEACHER_CORRECTION: PenLine };
const STATUS_TONE: Record<string, any> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'destructive', CANCELLED: 'muted' };
const FILTERS = ['PENDING', 'APPROVED', 'REJECTED', ''] as const;

/** Inbox for disputes, manual check-in requests and corrections (spec 4.5, 18.3). */
export function RequestsInbox({ mode }: { mode: 'staff' | 'student' }) {
  const t = useT();
  const fmt = useFormat();
  const qc = useQueryClient();
  const [status, setStatus] = React.useState<string>(mode === 'staff' ? 'PENDING' : '');
  const [kind, setKind] = React.useState('');
  const [review, setReview] = React.useState<{ req: any; decision: 'approve' | 'reject' } | null>(null);
  const list = useQuery({ queryKey: ['requests', status, kind], queryFn: () => api(`/requests?status=${status}&kind=${kind}`), refetchInterval: 30_000 });
  const counts = useQuery({ queryKey: ['requests', 'PENDING', ''], queryFn: () => api('/requests?status=PENDING'), enabled: status !== 'PENDING' || !!kind });
  const pending = (status === 'PENDING' && !kind ? list.data : counts.data)?.items.length ?? 0;
  const items: any[] = list.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border bg-card p-1 shadow-sm">
          {FILTERS.map((f) => (
            <button
              key={f || 'all'}
              onClick={() => setStatus(f)}
              className={cn('flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors', status === f ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary hover:text-foreground')}
            >
              {t(f ? (`request.status.${f}` as MessageKey) : 'common.all')}
              {f === 'PENDING' && pending > 0 && <span className={cn('rounded-full px-1.5 text-xs tabular', status === f ? 'bg-white/25' : 'bg-warning/15 text-warning')}>{pending}</span>}
            </button>
          ))}
        </div>
        {mode === 'staff' && <div className="flex flex-wrap gap-1.5">
          {['', 'STUDENT_DISPUTE', 'MANUAL_CHECKIN', 'TEACHER_CORRECTION'].map((k) => {
            const Icon = KIND_ICON[k] ?? Inbox;
            return (
              <button key={k || 'all'} onClick={() => setKind(k)} className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors', kind === k ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary')}>
                <Icon className="size-3.5" /> {t(k ? (`request.kind.${k}` as MessageKey) : 'common.all')}
              </button>
            );
          })}
        </div>}
      </div>

      {list.isLoading ? (
        <Spinner />
      ) : !items.length ? (
        <EmptyState icon={status === 'PENDING' ? CheckCircle2 : Inbox} title={status === 'PENDING' ? t('request.emptyPending') : t('request.empty')} description={mode === 'student' ? t('request.studentHint') : t('request.staffHint')} />
      ) : (
        <div className="grid gap-3">
          {items.map((r) => {
            const Icon = KIND_ICON[r.kind] ?? Inbox;
            return (
              <Card key={r.id} className={cn('overflow-hidden transition-shadow hover:shadow-md', r.status === 'PENDING' && 'border-l-4 border-l-warning')}>
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{mode === 'staff' ? initials(r.student.name) : <Icon className="size-5" />}</div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {mode === 'staff' && <span className="font-semibold">{r.student.name}</span>}
                        {mode === 'staff' && r.student.studentProfile?.facultyNumber && <span className="tabular text-xs text-muted-foreground">{r.student.studentProfile.facultyNumber}</span>}
                        <Badge variant="outline"><Icon className="size-3" /> {t(`request.kind.${r.kind}` as MessageKey)}</Badge>
                        <Badge variant={STATUS_TONE[r.status]}>{t(`request.status.${r.status}` as MessageKey)}</Badge>
                        {r.status === 'PENDING' && r.lesson.status === 'LOCKED' && <Badge variant="muted" title={t('request.lockedHint')}><Lock className="size-3" /> {t('request.locked')}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{r.lesson.course.code}</span> · {r.lesson.course.title} · {fmt.weekday(r.lesson.startsAt)} {fmt.time(r.lesson.startsAt)}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <AttendanceBadge status={r.attendance?.status ?? null} />
                        {r.requestedStatus && (<><ArrowRight className="size-3.5 text-muted-foreground" /><AttendanceBadge status={r.requestedStatus} /></>)}
                      </div>
                      <blockquote className="rounded-lg border-l-2 border-primary/40 bg-muted/50 px-3 py-2 text-sm">“{r.reason}”</blockquote>
                      {r.reviewNote && <p className="text-xs text-muted-foreground">{t('request.reviewNote')}: {r.reviewNote}</p>}
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3" /> {fmt.relative(r.createdAt)}
                        {r.reviewer && <> · {t('request.reviewedBy', { name: r.reviewer.name })} {fmt.relative(r.reviewedAt)}</>}
                      </p>
                    </div>
                  </div>
                  {r.status === 'PENDING' && (
                    <div className="flex shrink-0 gap-2 sm:flex-col">
                      {mode === 'staff' ? (
                        <>
                          <Button size="sm" onClick={() => setReview({ req: r, decision: 'approve' })}><Check /> {t('request.approve')}</Button>
                          <Button size="sm" variant="outline" onClick={() => setReview({ req: r, decision: 'reject' })}><X /> {t('request.reject')}</Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => api(`/requests/${r.id}/cancel`, { method: 'POST' }).then(() => { toast.success(t('common.saved')); qc.invalidateQueries({ queryKey: ['requests'] }); }).catch((e) => toast.error(errorMessage(e, t)))}
                        >
                          <XCircle /> {t('common.cancel')}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <ReviewDialog value={review} onClose={() => setReview(null)} onDone={() => qc.invalidateQueries({ queryKey: ['requests'] })} />
    </div>
  );
}

function ReviewDialog({ value, onClose, onDone }: { value: { req: any; decision: 'approve' | 'reject' } | null; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => setNote(''), [value]);
  const approve = value?.decision === 'approve';
  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={approve ? t('request.approveTitle') : t('request.rejectTitle')} description={value ? `${value.req.student.name} · ${value.req.lesson.course.code}` : ''}>
        <Textarea placeholder={approve ? t('request.noteOptional') : t('request.noteRequired')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant={approve ? 'default' : 'destructive'}
            loading={busy}
            disabled={!approve && note.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`/requests/${value!.req.id}/${value!.decision}`, { body: { note: note.trim() || undefined } });
                toast.success(approve ? t('request.approved') : t('request.rejected'));
                onDone();
                onClose();
              } catch (e) {
                toast.error(errorMessage(e, t));
              } finally {
                setBusy(false);
              }
            }}
          >
            {approve ? <Check /> : <X />} {approve ? t('request.approve') : t('request.reject')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
