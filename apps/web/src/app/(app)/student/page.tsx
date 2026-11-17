'use client';
import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, CheckCircle2, Clock, Percent, QrCode, ScanLine, Smartphone, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader, Stat } from '@/components/ui/misc';
import { LessonBadge } from '@/components/status';
import { StudentHistoryTable, useMyAttendance } from '@/components/student-history';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { useT } from '@/lib/i18n';

export default function StudentHome() {
  const t = useT();
  const me = useMe();
  const att = useMyAttendance();
  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api('/courses'), refetchInterval: 30_000 });
  const s = att.data?.stats;
  const name = me.data?.user.preferredName || me.data?.user.name.split(' ')[0] || '';
  const live = (courses.data?.items ?? []).filter((c: any) => c.activeLessonId);
  return (
    <div>
      <PageHeader title={t('student.title', { name })} description={t('student.subtitle')} />

      {live.length > 0 && (
        <Card className="mb-6 border-success/40 bg-success/5">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <LessonBadge status="ACTIVE" />
              <p className="font-semibold">{live.map((c: any) => `${c.code} · ${c.title}`).join(', ')}</p>
            </div>
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><QrCode className="size-4" /> {t('student.how1')}</p>
          </CardContent>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('student.rate')} value={s?.rate == null ? '–' : `${s.rate}%`} icon={Percent} />
        <Stat label={t('student.present')} value={s?.present ?? '–'} icon={CheckCircle2} tone="success" />
        <Stat label={t('student.late')} value={s?.late ?? '–'} icon={Clock} tone="warning" />
        <Stat label={t('student.absent')} value={s?.absent ?? '–'} icon={XCircle} tone="destructive" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{t('student.recent')}</CardTitle>
            <Button variant="link" asChild className="h-auto p-0"><Link href="/student/history">{t('nav.history')}</Link></Button>
          </CardHeader>
          <CardContent className="px-0"><StudentHistoryTable limit={8} /></CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t('student.howTitle')}</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                {[
                  [Smartphone, 'student.how1'],
                  [ScanLine, 'student.how2'],
                  [CheckCircle2, 'student.how3'],
                ].map(([Icon, k]: any, i) => (
                  <li key={k} className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span><span className="pt-1">{t(k)}</span></li>
                ))}
              </ol>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="size-4" /> {t('student.courses')}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(courses.data?.items ?? []).map((c: any) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <div><p className="text-sm font-semibold">{c.code}</p><p className="text-xs text-muted-foreground">{c.title}</p></div>
                  {c.activeLessonId && <LessonBadge status="ACTIVE" />}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
