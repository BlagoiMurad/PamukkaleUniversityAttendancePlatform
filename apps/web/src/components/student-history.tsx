'use client';
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquareWarning } from 'lucide-react';
import { toast } from 'sonner';
import { AttendanceBadge } from './status';
import { Button } from './ui/button';
import { Dialog, DialogContent } from './ui/dialog';
import { Field, Select, Textarea } from './ui/input';
import { Alert, EmptyState, Spinner, Table, TBody, TD, TH, THead, TR } from './ui/misc';
import { Badge } from './ui/badge';
import { api } from '@/lib/api';
import { useT, type MessageKey } from '@/lib/i18n';
import { useFormat } from '@/lib/format';
import { errorMessage } from '@/lib/errors';

export function useMyAttendance() {
  return useQuery({ queryKey: ['me', 'attendance'], queryFn: () => api('/me/attendance') });
}

export function StudentHistoryTable({ limit }: { limit?: number }) {
  const t = useT();
  const fmt = useFormat();
  const q = useMyAttendance();
  const [dispute, setDispute] = React.useState<any>(null);
  if (q.isLoading) return <Spinner />;
  const items = (q.data?.items ?? []).slice(0, limit);
  if (!items.length) return <EmptyState title={t('student.noHistory')} description={t('student.subtitle')} />;
  return (
    <>
      <Table>
        <THead>
          <TR>
            <TH className="pl-5">{t('lesson.startsAt')}</TH>
            <TH>{t('nav.courses')}</TH>
            <TH>{t('common.status')}</TH>
            {/* The action moves into the status cell on phones, so this column disappears. */}
            <TH className="hidden sm:table-cell">{t('lesson.checkedIn')}</TH>
            <TH className="hidden pr-5 text-right sm:table-cell" />
          </TR>
        </THead>
        <TBody>
          {items.map((a: any) => (
            <TR key={a.id}>
              <TD className="pl-3 sm:pl-5"><p className="font-medium">{fmt.weekday(a.lesson.startsAt)}</p><p className="text-xs text-muted-foreground">{fmt.time(a.lesson.startsAt)}</p></TD>
              <TD className="max-w-[8rem] sm:max-w-none"><p className="font-medium">{a.lesson.course.code}</p><p className="truncate text-xs text-muted-foreground">{a.lesson.title || a.lesson.course.title}</p></TD>
              <TD>
                <AttendanceBadge status={a.status} />
                {a.verifiedAt && <span className="tabular mt-1 block text-xs text-muted-foreground sm:hidden">{fmt.timeSec(a.verifiedAt)}</span>}
                <span className="mt-1 block sm:hidden">
                  {a.dispute ? (
                    <Badge variant={a.dispute.status === 'PENDING' ? 'warning' : a.dispute.status === 'APPROVED' ? 'success' : 'muted'}>{a.dispute.status.toLowerCase()}</Badge>
                  ) : (
                    a.status !== 'PRESENT' && a.status !== 'MANUAL_PRESENT' && (
                      <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setDispute(a)}>
                        {t('student.dispute')}
                      </button>
                    )
                  )}
                </span>
              </TD>
              <TD className="tabular hidden text-sm text-muted-foreground sm:table-cell">{a.verifiedAt ? fmt.timeSec(a.verifiedAt) : '—'}</TD>
              <TD className="hidden pr-5 text-right sm:table-cell">
                {a.dispute ? (
                  <Badge variant={a.dispute.status === 'PENDING' ? 'warning' : a.dispute.status === 'APPROVED' ? 'success' : 'muted'}>{a.dispute.status.toLowerCase()}</Badge>
                ) : (
                  a.status !== 'PRESENT' && a.status !== 'MANUAL_PRESENT' && (
                    <Button size="sm" variant="ghost" onClick={() => setDispute(a)} aria-label={t('student.dispute')}>
                      <MessageSquareWarning />
                      {/* The label alone is wider than a phone column allows. */}
                      <span className="hidden sm:inline">{t('student.dispute')}</span>
                    </Button>
                  )
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <DisputeDialog attendance={dispute} onClose={() => setDispute(null)} />
    </>
  );
}

function DisputeDialog({ attendance, onClose }: { attendance: any; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [reason, setReason] = React.useState('');
  const [status, setStatus] = React.useState('PRESENT');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => {
    setReason('');
    setErr(null);
  }, [attendance]);
  return (
    <Dialog open={!!attendance} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t('student.disputeTitle')} description={attendance ? `${attendance.lesson.course.code} · ${attendance.lesson.title ?? ''}` : ''}>
        <Field label={t('common.status')} htmlFor="ds">
          <Select id="ds" value={status} onChange={(e) => setStatus(e.target.value)}>
            {['PRESENT', 'LATE', 'EXCUSED'].map((s) => <option key={s} value={s}>{t(`status.${s}` as MessageKey)}</option>)}
          </Select>
        </Field>
        <Field label={t('common.reason')} htmlFor="dr"><Textarea id="dr" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></Field>
        {err && <Alert variant="destructive">{err}</Alert>}
        <Button
          loading={busy}
          disabled={reason.trim().length < 3}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await api(`/attendance/${attendance.id}/disputes`, { body: { requestedStatus: status, reason } });
              toast.success(t('student.disputeSent'));
              qc.invalidateQueries({ queryKey: ['me', 'attendance'] });
              onClose();
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
  );
}
