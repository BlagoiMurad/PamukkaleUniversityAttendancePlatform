'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Play } from 'lucide-react';
import { toast } from 'sonner';
import { Button, type ButtonProps } from '../ui/button';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import { uuid } from '@/lib/utils';

/** "Start lesson now": creates + starts a lesson with an Idempotency-Key so double clicks never start twice. */
export function StartLessonButton({ courseId, ...props }: { courseId: string } & ButtonProps) {
  const t = useT();
  const router = useRouter();
  const key = React.useRef(uuid());
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      {...props}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const lesson = await api(`/courses/${courseId}/lessons/start-now`, { body: { durationMinutes: 90 }, idempotencyKey: key.current });
          router.push(`/teacher/lessons/${lesson.id}`);
        } catch (e) {
          toast.error(errorMessage(e, t));
          key.current = uuid();
        } finally {
          setBusy(false);
        }
      }}
    >
      <Play /> {t('teacher.startNow')}
    </Button>
  );
}
