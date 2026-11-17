'use client';
import * as React from 'react';
import { use } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarPlus, CalendarDays, Download, FileSpreadsheet, Pencil, Search, Trash2, UserPlus, Users, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Alert, EmptyState, PageHeader, Spinner, Table, TBody, TD, TH, THead, TR } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { LessonBadge } from '@/components/status';
import { StartLessonButton } from '@/components/teacher/start-lesson-button';
import { CourseDialog } from '@/components/teacher/courses-list';
import { CourseReports } from '@/components/teacher/course-reports';
import { api, download } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import { useFormat } from '@/lib/format';

export default function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const me = useMe();
  const course = useQuery({ queryKey: ['course', id], queryFn: () => api(`/courses/${id}`) });
  const [edit, setEdit] = React.useState(false);
  if (course.isLoading) return <Spinner />;
  if (course.error) return <Alert variant="destructive">{errorMessage(course.error, t)}</Alert>;
  const c = course.data;
  return (
    <div>
      <PageHeader
        eyebrow={`${c.code} · ${c.term}${c.faculty ? ` · ${c.faculty}` : ''}`}
        title={c.title}
        description={`${t('teacher.students', { count: c.studentCount })} · ${c.teachers.map((x: any) => x.name).join(', ') || c.owner.name}`}
        actions={
          <>
            {c.permissions.manageTeachers && <Button variant="outline" onClick={() => setEdit(true)}><Pencil /> {t('common.edit')}</Button>}
            {c.status === 'ACTIVE' && <StartLessonButton courseId={id} />}
          </>
        }
      />
      <Tabs defaultValue="lessons">
        <TabsList className="flex-wrap">
          <TabsTrigger value="lessons"><CalendarDays /> {t('course.tabLessons')}</TabsTrigger>
          <TabsTrigger value="students"><Users /> {t('course.tabStudents')}</TabsTrigger>
          <TabsTrigger value="teachers"><GraduationCap /> {t('course.tabTeachers')}</TabsTrigger>
          <TabsTrigger value="reports"><FileSpreadsheet /> {t('course.tabReports')}</TabsTrigger>
        </TabsList>
        <TabsContent value="lessons"><LessonsTab courseId={id} /></TabsContent>
        <TabsContent value="students"><StudentsTab courseId={id} canManage={c.permissions.manageRoster} /></TabsContent>
        <TabsContent value="teachers"><TeachersTab course={c} isAdmin={me.data?.user.role === 'ADMIN'} /></TabsContent>
        <TabsContent value="reports"><CourseReports courseId={id} /></TabsContent>
      </Tabs>
      {edit && <CourseDialog open={edit} onOpenChange={setEdit} isAdmin={me.data?.user.role === 'ADMIN'} course={c} />}
    </div>
  );
}

function LessonsTab({ courseId }: { courseId: string }) {
  const t = useT();
  const fmt = useFormat();
  const qc = useQueryClient();
  const lessons = useQuery({ queryKey: ['lessons', 'course', courseId], queryFn: () => api(`/lessons?courseId=${courseId}`) });
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState({ title: '', room: '', start: '', duration: 90 });
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (open) {
      const d = new Date(Date.now() + 86400_000);
      d.setMinutes(0, 0, 0);
      setV({ title: '', room: '', start: fmt.toLocalInput(d), duration: 90 });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = lessons.data?.items ?? [];
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{t('course.tabLessons')}</CardTitle>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}><CalendarPlus /> {t('course.schedule')}</Button>
      </CardHeader>
      <CardContent className="px-0">
        {lessons.isLoading ? (
          <Spinner />
        ) : !items.length ? (
          <div className="px-5"><EmptyState icon={CalendarDays} title={t('course.noLessons')} /></div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">{t('lesson.startsAt')}</TH>
                <TH>{t('lesson.title')}</TH>
                <TH>{t('common.status')}</TH>
                <TH>{t('lesson.checkedIn')}</TH>
                <TH className="pr-5 text-right">{t('common.actions')}</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((l: any) => (
                <TR key={l.id}>
                  <TD className="pl-5"><p className="font-medium">{fmt.weekday(l.startsAt)}</p><p className="text-xs text-muted-foreground">{fmt.time(l.startsAt)}–{fmt.time(l.scheduledEndAt)}</p></TD>
                  <TD>{l.title || '—'}{l.room && <span className="text-muted-foreground"> · {l.room}</span>}</TD>
                  <TD><LessonBadge status={l.status} /></TD>
                  <TD className="tabular">{l.status === 'DRAFT' || l.status === 'CANCELLED' ? '—' : l.presentCount}</TD>
                  <TD className="pr-5">
                    <div className="flex justify-end gap-1">
                      {(l.status === 'ENDED' || l.status === 'LOCKED') && (
                        <Button size="sm" variant="ghost" onClick={() => download(`/teacher/lessons/${l.id}/report.xlsx`, `lesson.xlsx`).catch((e) => toast.error(errorMessage(e, t)))} aria-label="Excel"><Download /></Button>
                      )}
                      <Button size="sm" variant="outline" asChild><Link href={`/teacher/lessons/${l.id}`}>{l.status === 'ACTIVE' ? t('teacher.openLive') : t('common.actions')}</Link></Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t('course.schedule')}>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setErr(null);
              try {
                const startsAt = fmt.fromLocalInput(v.start);
                await api(`/courses/${courseId}/lessons`, { body: { startsAt, scheduledEndAt: new Date(startsAt.getTime() + v.duration * 60_000), title: v.title || null, room: v.room || null } });
                qc.invalidateQueries({ queryKey: ['lessons'] });
                setOpen(false);
                toast.success(t('common.saved'));
              } catch (e2) {
                setErr(errorMessage(e2, t));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label={t('lesson.title')} htmlFor="lt"><Input id="lt" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`${t('lesson.startsAt')} (${fmt.timeZone})`} htmlFor="ls"><Input id="ls" type="datetime-local" required value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} /></Field>
              <Field label={t('lesson.duration')} htmlFor="ld"><Input id="ld" type="number" min={10} max={600} value={v.duration} onChange={(e) => setV({ ...v, duration: Number(e.target.value) })} /></Field>
            </div>
            <Field label={t('lesson.room')} htmlFor="lr"><Input id="lr" value={v.room} onChange={(e) => setV({ ...v, room: e.target.value })} /></Field>
            {err && <Alert variant="destructive">{err}</Alert>}
            <div className="flex justify-end gap-2"><Button type="submit" loading={busy}>{t('common.save')}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function StudentsTab({ courseId, canManage }: { courseId: string; canManage: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const [showWithdrawn, setShowWithdrawn] = React.useState(false);
  const enr = useQuery({ queryKey: ['enrollments', courseId, showWithdrawn], queryFn: () => api(`/courses/${courseId}/enrollments?includeWithdrawn=${showWithdrawn}`) });
  const [open, setOpen] = React.useState(false);
  const [remove, setRemove] = React.useState<any>(null);
  const [filter, setFilter] = React.useState('');
  const items = (enr.data?.items ?? []).filter((e: any) => {
    const q = filter.toLowerCase();
    return !q || [e.student.name, e.student.email, e.student.studentProfile?.facultyNumber, e.student.studentProfile?.group].some((v) => v?.toLowerCase().includes(q));
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['enrollments', courseId] });
    qc.invalidateQueries({ queryKey: ['course', courseId] });
  };
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle>{t('course.tabStudents')} ({enr.data?.items.filter((e: any) => e.state === 'ACTIVE').length ?? '–'})</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={showWithdrawn} onChange={(e) => setShowWithdrawn(e.target.checked)} /> withdrawn</label>
          <div className="relative"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input className="h-9 w-48 pl-8" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('common.search')} /></div>
          {canManage && <Button size="sm" onClick={() => setOpen(true)}><UserPlus /> {t('course.addStudents')}</Button>}
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {enr.isLoading ? (
          <Spinner />
        ) : !items.length ? (
          <div className="px-5"><EmptyState icon={Users} title={t('course.noStudents')} action={canManage ? <Button onClick={() => setOpen(true)}><UserPlus /> {t('course.addStudents')}</Button> : undefined} /></div>
        ) : (
          <Table>
            <THead><TR><TH className="pl-5">{t('common.name')}</TH><TH>{t('course.facultyNumber')}</TH><TH>{t('course.group')}</TH><TH>{t('common.status')}</TH><TH className="pr-5" /></TR></THead>
            <TBody>
              {items.map((e: any) => (
                <TR key={e.id}>
                  <TD className="pl-5"><p className="font-medium">{e.student.name}</p><p className="text-xs text-muted-foreground">{e.student.email}</p></TD>
                  <TD className="tabular">{e.student.studentProfile?.facultyNumber ?? '—'}</TD>
                  <TD>{e.student.studentProfile?.group ?? '—'}</TD>
                  <TD>{e.state === 'ACTIVE' ? <Badge variant="success">enrolled</Badge> : <Badge variant="muted">withdrawn</Badge>}</TD>
                  <TD className="pr-5 text-right">
                    {canManage && e.state === 'ACTIVE' && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRemove(e.student)}><Trash2 /> {t('course.unenroll')}</Button>}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
      <AddStudentsDialog courseId={courseId} open={open} onOpenChange={setOpen} onDone={refresh} />
      <Dialog open={!!remove} onOpenChange={(o) => !o && setRemove(null)}>
        <DialogContent title={t('course.unenroll')} description={remove ? t('course.unenrollConfirm', { name: remove.name }) : ''}>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRemove(null)}>{t('common.cancel')}</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await api(`/courses/${courseId}/enrollments/${remove.id}`, { method: 'DELETE' });
                  refresh();
                  setRemove(null);
                } catch (e) {
                  toast.error(errorMessage(e, t));
                }
              }}
            >
              {t('course.unenroll')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AddStudentsDialog({ courseId, open, onOpenChange, onDone }: { courseId: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const t = useT();
  const [q, setQ] = React.useState('');
  const [picked, setPicked] = React.useState<Map<string, any>>(new Map());
  const [paste, setPaste] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);
  const search = useQuery({ queryKey: ['directory', 'students', q], queryFn: () => api(`/directory/students?q=${encodeURIComponent(q)}`), enabled: open });
  React.useEffect(() => {
    if (open) {
      setPicked(new Map());
      setPaste('');
      setResult(null);
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('course.addStudents')} description={t('course.addStudentsHint')} className="max-w-2xl">
        <div className="relative"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input autoFocus className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')} /></div>
        <div className="max-h-64 overflow-y-auto rounded-lg border">
          {(search.data?.items ?? []).map((s: any) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-0 hover:bg-secondary">
              <input
                type="checkbox"
                checked={picked.has(s.id)}
                onChange={(e) => {
                  const n = new Map(picked);
                  if (e.target.checked) n.set(s.id, s);
                  else n.delete(s.id);
                  setPicked(n);
                }}
              />
              <span className="flex-1"><span className="font-medium">{s.name}</span> <span className="text-xs text-muted-foreground">{s.email}</span></span>
              <span className="tabular text-xs text-muted-foreground">{s.studentProfile?.facultyNumber}</span>
            </label>
          ))}
        </div>
        <Field label={t('course.paste')} htmlFor="paste"><Textarea id="paste" rows={3} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'student02@pau.edu.tr\n20261005'} /></Field>
        {result && <Alert variant="success">{result}</Alert>}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">{picked.size} selected</span>
          <Button
            loading={busy}
            disabled={!picked.size && !paste.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                const identifiers = paste.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
                const r = await api(`/courses/${courseId}/enrollments`, { body: { studentIds: [...picked.keys()], identifiers } });
                setResult(t('course.added', { added: r.added, already: r.alreadyEnrolled }) + (r.notFound.length ? ` · ${t('course.notFound', { list: r.notFound.join(', ') })}` : ''));
                setPicked(new Map());
                setPaste('');
                onDone();
              } catch (e) {
                toast.error(errorMessage(e, t));
              } finally {
                setBusy(false);
              }
            }}
          >
            <UserPlus /> {t('common.add')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TeachersTab({ course, isAdmin }: { course: any; isAdmin: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const [teacherId, setTeacherId] = React.useState('');
  const dir = useQuery({ queryKey: ['directory', 'teachers'], queryFn: () => api('/directory/teachers'), enabled: course.permissions.manageTeachers });
  const refresh = () => qc.invalidateQueries({ queryKey: ['course', course.id] });
  return (
    <Card>
      <CardHeader><CardTitle>{t('course.teachers')}</CardTitle><CardDescription>{t('course.owner')}: {course.owner.name}</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {course.teachers.map((x: any) => (
          <div key={x.id} className="flex items-center justify-between rounded-lg border p-3">
            <div><p className="font-medium">{x.name}</p><p className="text-xs text-muted-foreground">{x.email} · {x.role.replace('_', '-').toLowerCase()}</p></div>
            {course.permissions.manageTeachers && x.id !== course.ownerId && (
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => api(`/courses/${course.id}/teachers/${x.id}`, { method: 'DELETE' }).then(refresh).catch((e) => toast.error(errorMessage(e, t)))}><Trash2 /></Button>
            )}
          </div>
        ))}
        {course.permissions.manageTeachers && (
          <div className="flex gap-2">
            <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">—</option>
              {(dir.data?.items ?? []).filter((d: any) => !course.teachers.some((x: any) => x.id === d.id)).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
            <Button disabled={!teacherId} onClick={() => api(`/courses/${course.id}/teachers`, { body: { teacherId, role: 'CO_TEACHER', canManageRoster: true } }).then(() => { setTeacherId(''); refresh(); }).catch((e) => toast.error(errorMessage(e, t)))}>
              <UserPlus /> {t('common.add')}
            </Button>
          </div>
        )}
        {!isAdmin && !course.permissions.manageTeachers && null}
      </CardContent>
    </Card>
  );
}
