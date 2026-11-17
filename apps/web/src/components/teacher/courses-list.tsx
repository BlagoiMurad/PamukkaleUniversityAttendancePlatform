'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Field, Input } from '../ui/input';
import { EmptyState, PageHeader, Spinner, Table, TBody, TD, TH, THead, TR, Alert } from '../ui/misc';
import { Dialog, DialogContent } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { LessonBadge } from '../status';
import { StartLessonButton } from './start-lesson-button';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';

export function CoursesList() {
  const t = useT();
  const me = useMe();
  const params = useSearchParams();
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(params.get('new') === '1');
  const courses = useQuery({ queryKey: ['courses', q], queryFn: () => api(`/courses${q ? `?q=${encodeURIComponent(q)}` : ''}`) });
  const isAdmin = me.data?.user.role === 'ADMIN';
  const canCreate = isAdmin || me.data?.settings.teacherCanCreateCourses;
  return (
    <div>
      <PageHeader title={isAdmin ? t('nav.courses') : t('nav.myCourses')} actions={canCreate && <Button onClick={() => setOpen(true)}><Plus /> {t('course.new')}</Button>} />
      <Card>
        <div className="border-b p-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
          </div>
        </div>
        {courses.isLoading ? (
          <Spinner />
        ) : !courses.data?.items.length ? (
          <div className="p-5"><EmptyState icon={BookOpen} title={t('teacher.noCourses')} description={t('teacher.noCoursesHint')} /></div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">{t('course.code')}</TH>
                <TH>{t('course.title')}</TH>
                <TH>{t('course.term')}</TH>
                <TH>{t('course.teachers')}</TH>
                <TH>{t('course.tabStudents')}</TH>
                <TH className="pr-5 text-right">{t('common.actions')}</TH>
              </TR>
            </THead>
            <TBody>
              {courses.data.items.map((c: any) => (
                <TR key={c.id}>
                  <TD className="pl-5 font-semibold">{c.code}</TD>
                  <TD>
                    <Link href={`/teacher/courses/${c.id}`} className="font-medium hover:underline">{c.title}</Link>
                    {c.status === 'ARCHIVED' && <Badge variant="muted" className="ml-2">archived</Badge>}
                  </TD>
                  <TD className="text-muted-foreground">{c.term}</TD>
                  <TD className="text-sm text-muted-foreground">{c.teachers.map((x: any) => x.name).join(', ') || c.owner.name}</TD>
                  <TD className="tabular">{c.studentCount}</TD>
                  <TD className="pr-5">
                    <div className="flex justify-end gap-2">
                      {c.activeLessonId ? (
                        <Button size="sm" asChild><Link href={`/teacher/lessons/${c.activeLessonId}`}><LessonBadge status="ACTIVE" /></Link></Button>
                      ) : (
                        c.status === 'ACTIVE' && <StartLessonButton courseId={c.id} size="sm" variant="outline" />
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <CourseDialog open={open} onOpenChange={setOpen} isAdmin={isAdmin} />
    </div>
  );
}

export function CourseDialog({ open, onOpenChange, isAdmin, course }: { open: boolean; onOpenChange: (o: boolean) => void; isAdmin: boolean; course?: any }) {
  const t = useT();
  const qc = useQueryClient();
  const router = useRouter();
  const [v, setV] = React.useState({ code: course?.code ?? '', title: course?.title ?? '', term: course?.term ?? defaultTerm(), faculty: course?.faculty ?? '', ownerId: course?.ownerId ?? '' });
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const teachers = useQuery({ queryKey: ['directory', 'teachers'], queryFn: () => api('/directory/teachers'), enabled: isAdmin && open && !course });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={course ? t('common.edit') : t('course.new')}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            try {
              const body: any = { code: v.code, title: v.title, term: v.term, faculty: v.faculty || null };
              if (isAdmin && v.ownerId && !course) body.ownerId = v.ownerId;
              const res = course ? await api(`/courses/${course.id}`, { method: 'PATCH', body }) : await api('/courses', { body });
              await qc.invalidateQueries({ queryKey: ['courses'] });
              await qc.invalidateQueries({ queryKey: ['course'] });
              toast.success(t('common.saved'));
              onOpenChange(false);
              if (!course) router.push(`/teacher/courses/${res.id}`);
            } catch (e2) {
              setErr(errorMessage(e2, t));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid grid-cols-3 gap-3">
            <Field label={t('course.code')} htmlFor="code"><Input id="code" required value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} placeholder="CENG301" /></Field>
            <div className="col-span-2"><Field label={t('course.term')} htmlFor="term"><Input id="term" required value={v.term} onChange={(e) => setV({ ...v, term: e.target.value })} /></Field></div>
          </div>
          <Field label={t('course.title')} htmlFor="title"><Input id="title" required value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
          <Field label={t('course.faculty')} htmlFor="faculty"><Input id="faculty" value={v.faculty} onChange={(e) => setV({ ...v, faculty: e.target.value })} /></Field>
          {isAdmin && !course && (
            <Field label={t('course.owner')} htmlFor="owner">
              <select id="owner" className="flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm" value={v.ownerId} onChange={(e) => setV({ ...v, ownerId: e.target.value })}>
                <option value="">—</option>
                {(teachers.data?.items ?? []).map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </Field>
          )}
          {err && <Alert variant="destructive">{err}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={busy}>{t('common.save')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function defaultTerm() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() >= 7 || d.getMonth() === 0 ? 'Fall' : 'Spring'}`;
}
