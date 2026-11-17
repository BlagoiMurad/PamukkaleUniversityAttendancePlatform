'use client';
import { CheckCircle2, Clock, MinusCircle, Radio, UserX, XCircle, Lock, CalendarClock, Ban, ShieldCheck } from 'lucide-react';
import { Badge } from './ui/badge';
import { useT, type MessageKey } from '@/lib/i18n';

export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'MANUAL_PRESENT' | 'MANUAL_LATE' | 'EXCUSED' | 'REMOVED_FROM_SESSION';

const map: Record<string, { v: 'success' | 'warning' | 'destructive' | 'muted' | 'default'; icon: any }> = {
  PRESENT: { v: 'success', icon: CheckCircle2 },
  MANUAL_PRESENT: { v: 'success', icon: ShieldCheck },
  LATE: { v: 'warning', icon: Clock },
  MANUAL_LATE: { v: 'warning', icon: Clock },
  ABSENT: { v: 'destructive', icon: XCircle },
  EXCUSED: { v: 'default', icon: MinusCircle },
  REMOVED_FROM_SESSION: { v: 'muted', icon: UserX },
  PENDING: { v: 'muted', icon: MinusCircle },
};

export function AttendanceBadge({ status }: { status?: string | null }) {
  const t = useT();
  const s = status ?? 'PENDING';
  const m = map[s] ?? map.PENDING;
  const Icon = m.icon;
  return (
    <Badge variant={m.v}>
      <Icon className="size-3.5" /> {t(`status.${s}` as MessageKey)}
    </Badge>
  );
}

const lessonMap: Record<string, { v: any; icon: any }> = {
  DRAFT: { v: 'outline', icon: CalendarClock },
  ACTIVE: { v: 'success', icon: Radio },
  ENDED: { v: 'muted', icon: CheckCircle2 },
  LOCKED: { v: 'muted', icon: Lock },
  CANCELLED: { v: 'destructive', icon: Ban },
};

export function LessonBadge({ status }: { status: string }) {
  const t = useT();
  const m = lessonMap[status] ?? lessonMap.DRAFT;
  const Icon = m.icon;
  return (
    <Badge variant={m.v}>
      {status === 'ACTIVE' ? <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-success" /></span> : <Icon className="size-3.5" />}
      {t(`lesson.${status}` as MessageKey)}
    </Badge>
  );
}
