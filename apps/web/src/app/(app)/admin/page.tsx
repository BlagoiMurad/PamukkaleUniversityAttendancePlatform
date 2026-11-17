'use client';
import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, GraduationCap, Radio, ScrollText, Settings, Upload, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader, Stat } from '@/components/ui/misc';
import { LessonBadge } from '@/components/status';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useFormat } from '@/lib/format';

export default function AdminHome() {
  const t = useT();
  const fmt = useFormat();
  const students = useQuery({ queryKey: ['users', 'count', 'STUDENT'], queryFn: () => api('/admin/users?role=STUDENT&pageSize=1') });
  const teachers = useQuery({ queryKey: ['users', 'count', 'TEACHER'], queryFn: () => api('/admin/users?role=TEACHER&pageSize=1') });
  const invited = useQuery({ queryKey: ['users', 'count', 'INVITED'], queryFn: () => api('/admin/users?status=INVITED&pageSize=1') });
  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api('/courses') });
  const active = useQuery({ queryKey: ['lessons', 'active'], queryFn: () => api('/lessons?status=ACTIVE'), refetchInterval: 20_000 });
  const links = [
    { href: '/admin/users', icon: Users, label: t('nav.users') },
    { href: '/admin/import', icon: Upload, label: t('nav.import') },
    { href: '/admin/courses', icon: BookOpen, label: t('nav.courses') },
    { href: '/admin/audit', icon: ScrollText, label: t('nav.audit') },
    { href: '/admin/settings', icon: Settings, label: t('nav.settings') },
  ];
  return (
    <div>
      <PageHeader title={t('admin.title')} description={t('admin.subtitle')} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('role.STUDENT')} value={students.data?.total ?? '–'} icon={GraduationCap} />
        <Stat label={t('role.TEACHER')} value={teachers.data?.total ?? '–'} icon={Users} />
        <Stat label={t('nav.courses')} value={courses.data?.items.length ?? '–'} icon={BookOpen} />
        <Stat label="Invited (not activated)" value={invited.data?.total ?? '–'} icon={Upload} tone="warning" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Radio className="size-4 text-success" /> {t('admin.activeLessons')}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {!active.data?.items.length && <p className="text-sm text-muted-foreground">—</p>}
            {(active.data?.items ?? []).map((l: any) => (
              <Link key={l.id} href={`/teacher/lessons/${l.id}`} className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-secondary">
                <div><p className="text-sm font-semibold">{l.course.code} · {l.course.title}</p><p className="text-xs text-muted-foreground">{l.teacher.name} · {fmt.time(l.actualStartedAt)}</p></div>
                <div className="flex items-center gap-2"><span className="tabular text-sm">{l.presentCount}</span><LessonBadge status="ACTIVE" /></div>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('nav.dashboard')}</CardTitle></CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {links.map((l) => (
              <Button key={l.href} variant="outline" asChild className="h-14 justify-between"><Link href={l.href}><span className="flex items-center gap-2"><l.icon /> {l.label}</span><ArrowRight /></Link></Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
