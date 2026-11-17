'use client';
import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, CalendarClock, MonitorPlay, Radio, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader, Skeleton, Stat } from '@/components/ui/misc';
import { LessonBadge } from '@/components/status';
import { StartLessonButton } from '@/components/teacher/start-lesson-button';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { useFormat } from '@/lib/format';

export default function TeacherDashboard() {
  const t = useT();
  const fmt = useFormat();
  const me = useMe();
  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api('/courses') });
  const weekStart = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const upcoming = useQuery({ queryKey: ['lessons', 'upcoming'], queryFn: () => api(`/lessons?status=DRAFT&from=${new Date(Date.now() - 3600_000).toISOString()}`) });
  const active = useQuery({ queryKey: ['lessons', 'active'], queryFn: () => api('/lessons?status=ACTIVE'), refetchInterval: 20_000 });
  const recent = useQuery({ queryKey: ['lessons', 'recent'], queryFn: () => api(`/lessons?to=${new Date().toISOString()}`) });

  const weekLessons = (recent.data?.items ?? []).filter((l: any) => new Date(l.startsAt) >= weekStart && (l.status === 'ENDED' || l.status === 'LOCKED'));
  const totalStudents = (courses.data?.items ?? []).reduce((a: number, c: any) => a + c.studentCount, 0);
  const name = me.data?.user.preferredName || me.data?.user.name.split(' ').slice(-1)[0] || '';

  return (
    <div>
      <PageHeader title={t('teacher.dashboardTitle', { name })} description={t('teacher.dashboardSubtitle')} />

      {(active.data?.items ?? []).map((l: any) => (
        <Card key={l.id} className="mb-6 overflow-hidden border-success/40">
          <div className="flex flex-col gap-4 bg-gradient-to-r from-success/10 to-transparent p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="grid size-12 place-items-center rounded-xl bg-success/15 text-success"><Radio className="size-6" /></div>
              <div>
                <div className="flex items-center gap-2"><LessonBadge status="ACTIVE" /><span className="text-sm text-muted-foreground">{t('lesson.startedAt', { time: fmt.time(l.actualStartedAt) })}</span></div>
                <p className="mt-1 text-lg font-semibold">{l.course.code} · {l.course.title}</p>
                <p className="text-sm text-muted-foreground">{l.presentCount} {t('projector.checkedIn')}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" asChild><Link href={`/projector/${l.id}`} target="_blank"><MonitorPlay /> {t('lesson.projector')}</Link></Button>
              <Button asChild><Link href={`/teacher/lessons/${l.id}`}>{t('teacher.openLive')} <ArrowRight /></Link></Button>
            </div>
          </div>
        </Card>
      ))}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label={t('nav.myCourses')} value={courses.data?.items.length ?? '–'} icon={BookOpen} />
        <Stat label={t('course.tabStudents')} value={totalStudents || '–'} icon={Users} />
        <Stat label={t('teacher.thisWeek')} value={weekLessons.length} hint={t('teacher.lessons', { count: weekLessons.length })} icon={CalendarClock} />
      </div>

      <h2 className="mb-3 text-lg font-semibold">{t('nav.myCourses')}</h2>
      {courses.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : !courses.data?.items.length ? (
        <EmptyState icon={BookOpen} title={t('teacher.noCourses')} description={t('teacher.noCoursesHint')} action={me.data?.settings.teacherCanCreateCourses ? <Button asChild><Link href="/teacher/courses?new=1">{t('course.new')}</Link></Button> : undefined} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {courses.data.items.map((c: any) => (
            <Card key={c.id} className="group flex flex-col transition-shadow hover:shadow-md">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <span className="rounded-md bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">{c.code}</span>
                  {c.activeLessonId && <LessonBadge status="ACTIVE" />}
                </div>
                <CardTitle className="mt-2 text-lg"><Link href={`/teacher/courses/${c.id}`} className="hover:underline">{c.title}</Link></CardTitle>
                <CardDescription>{c.term} · {t('teacher.students', { count: c.studentCount })}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto flex gap-2">
                {c.activeLessonId ? (
                  <Button asChild className="flex-1"><Link href={`/teacher/lessons/${c.activeLessonId}`}>{t('teacher.openLive')}</Link></Button>
                ) : (
                  <StartLessonButton courseId={c.id} className="flex-1" />
                )}
                <Button variant="outline" asChild><Link href={`/teacher/courses/${c.id}`}><ArrowRight /></Link></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <LessonList title={t('teacher.upcoming')} items={(upcoming.data?.items ?? []).slice(0, 6)} empty={t('course.noLessons')} />
        <LessonList title={t('teacher.recent')} items={(recent.data?.items ?? []).filter((l: any) => l.status !== 'DRAFT' && l.status !== 'ACTIVE').slice(0, 6)} empty={t('course.noLessons')} />
      </div>
    </div>
  );
}

function LessonList({ title, items, empty }: { title: string; items: any[]; empty: string }) {
  const fmt = useFormat();
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1">
        {!items.length && <p className="py-4 text-sm text-muted-foreground">{empty}</p>}
        {items.map((l) => (
          <Link key={l.id} href={`/teacher/lessons/${l.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-secondary">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{l.course.code} · {l.title || l.course.title}</p>
              <p className="text-xs text-muted-foreground">{fmt.weekday(l.startsAt)} · {fmt.time(l.startsAt)}</p>
            </div>
            <div className="flex items-center gap-3">
              {l.status !== 'DRAFT' && <span className="tabular text-sm text-muted-foreground">{l.presentCount}</span>}
              <LessonBadge status={l.status} />
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
