'use client';
import * as React from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent } from '../ui/dialog';
import { Button } from '../ui/button';
import { Field, Select, Textarea } from '../ui/input';
import { Alert } from '../ui/misc';
import { api } from '@/lib/api';
import { useT, type MessageKey } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';

const STATUSES = ['MANUAL_PRESENT', 'MANUAL_LATE', 'ABSENT', 'EXCUSED', 'PRESENT', 'LATE'] as const;

export function CorrectionDialog({
  open,
  onOpenChange,
  lessonId,
  student,
  mode,
  initialStatus,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lessonId: string;
  student: { id: string; name: string } | null;
  mode: 'correct' | 'remove';
  initialStatus?: string;
  onDone: () => void;
}) {
  const t = useT();
  const [status, setStatus] = React.useState<string>(initialStatus && STATUSES.includes(initialStatus as any) ? initialStatus : 'MANUAL_PRESENT');
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (open) {
      setReason('');
      setErr(null);
      setStatus(initialStatus && STATUSES.includes(initialStatus as any) ? initialStatus : 'MANUAL_PRESENT');
    }
  }, [open, initialStatus]);
  if (!student) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={mode === 'remove' ? t('lesson.removeTitle', { name: student.name }) : t('lesson.correctTitle', { name: student.name })}
        description={mode === 'remove' ? t('lesson.removeHint') : undefined}
      >
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            try {
              const res =
                mode === 'remove'
                  ? await api(`/lessons/${lessonId}/attendance/${student.id}/remove`, { body: { reason } })
                  : await api(`/lessons/${lessonId}/attendance/${student.id}`, { method: 'PATCH', body: { status, reason } });
              toast.success(res?.pendingApproval ? t('lesson.pendingApproval') : t('common.saved'));
              onOpenChange(false);
              onDone();
            } catch (e2) {
              setErr(errorMessage(e2, t));
            } finally {
              setBusy(false);
            }
          }}
        >
          {mode === 'correct' && (
            <Field label={t('common.status')} htmlFor="status">
              <Select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{t(`status.${s}` as MessageKey)}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label={t('common.reason')} htmlFor="reason" hint={t('common.reasonHint')}>
            <Textarea id="reason" required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {err && <Alert variant="destructive">{err}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" variant={mode === 'remove' ? 'destructive' : 'default'} loading={busy} disabled={reason.trim().length < 3}>
              {mode === 'remove' ? t('common.remove') : t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
