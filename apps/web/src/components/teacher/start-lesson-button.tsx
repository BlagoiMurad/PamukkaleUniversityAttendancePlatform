'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Button, type ButtonProps } from '../ui/button';
import { Dialog, DialogContent, DialogTrigger } from '../ui/dialog';
import { Field, Input } from '../ui/input';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import { uuid } from '@/lib/utils';

/** `YYYY-MM-DD` / `HH:MM` in the viewer's own timezone, which is what the inputs expect. */
const dateValue = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const timeValue = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Local wall-clock date + time -> absolute instant. The API stores UTC. */
function toInstant(date: string, time: string) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

function defaults() {
  const now = new Date();
  // Round the start down to the previous 5 minutes so the field looks tidy.
  const from = new Date(now);
  from.setMinutes(Math.floor(now.getMinutes() / 5) * 5, 0, 0);
  const to = new Date(from.getTime() + 90 * 60_000);
  return { date: dateValue(from), from: timeValue(from), to: timeValue(to) };
}

/**
 * Starting a lesson asks for the date (today by default) and the time range the class runs in,
 * because those bounds decide who counts as late and when check-in closes. A range that begins
 * in the future is scheduled instead of started, so a teacher can set the whole week up in advance.
 */
export function StartLessonButton({ courseId, ...props }: { courseId: string } & ButtonProps) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState(defaults);
  const [room, setRoom] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const key = React.useRef(uuid());

  // Re-seed the fields each time the dialog opens, so "today" is really today.
  React.useEffect(() => {
    if (open) {
      setForm(defaults());
      setRoom('');
    }
  }, [open]);

  const startsAt = toInstant(form.date, form.from);
  const endsAt = toInstant(form.date, form.to);
  const invalidRange = !(endsAt.getTime() > startsAt.getTime());
  // A few minutes of slack: a teacher who opens this at 10:01 for a 10:00 class means "now".
  const scheduled = startsAt.getTime() > Date.now() + 5 * 60_000;

  const submit = async () => {
    setBusy(true);
    try {
      const lesson = await api(`/courses/${courseId}/lessons`, {
        body: {
          startsAt: startsAt.toISOString(),
          scheduledEndAt: endsAt.toISOString(),
          room: room.trim() || null,
        },
        idempotencyKey: key.current,
      });
      if (scheduled) {
        toast.success(t('lesson.scheduled'));
        setOpen(false);
        router.refresh();
        return;
      }
      await api(`/lessons/${lesson.id}/start`, { method: 'POST', idempotencyKey: uuid() });
      setOpen(false);
      router.push(`/teacher/lessons/${lesson.id}`);
    } catch (e) {
      toast.error(errorMessage(e, t));
      key.current = uuid();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button {...props}>
          <Play /> {t('teacher.startNow')}
        </Button>
      </DialogTrigger>
      <DialogContent title={t('lesson.startTitle')} description={t('lesson.startHint')}>
        <div className="space-y-4">
          <Field label={t('lesson.date')} htmlFor="lesson-date">
            <Input id="lesson-date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('lesson.from')} htmlFor="lesson-from">
              <Input id="lesson-from" type="time" value={form.from} onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))} />
            </Field>
            <Field label={t('lesson.to')} htmlFor="lesson-to" error={invalidRange ? t('lesson.rangeInvalid') : undefined}>
              <Input id="lesson-to" type="time" value={form.to} onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))} />
            </Field>
          </div>
          <Field label={t('lesson.room')} htmlFor="lesson-room">
            <Input id="lesson-room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder={t('lesson.roomPlaceholder')} maxLength={60} />
          </Field>
          <Button className="w-full" size="lg" loading={busy} disabled={invalidRange} onClick={submit}>
            {scheduled ? <><CalendarClock /> {t('lesson.schedule')}</> : <><Play /> {t('lesson.startNow')}</>}
          </Button>
          {scheduled && <p className="text-center text-sm text-muted-foreground">{t('lesson.scheduleHint')}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
