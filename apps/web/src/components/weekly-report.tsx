'use client';
import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarRange, ChevronLeft, ChevronRight, Clock, Download, TrendingUp, UserX, Users } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Select } from './ui/input';
import { EmptyState, Spinner, Stat } from './ui/misc';
import { api, download } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useFormat } from '@/lib/format';
import { errorMessage } from '@/lib/errors';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (s: string, days: number) => iso(new Date(new Date(s + 'T12:00:00Z').getTime() + days * 86400_000));
function mondayOf(d: Date) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return iso(x);
}
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

/** Weekly attendance overview (RPT-02, spec 22.1). Admins can narrow it to one teacher. */
export function WeeklyReport({ admin }: { admin?: boolean }) {
  const t = useT();
  const fmt = useFormat();
  const [week, setWeek] = React.useState(() => mondayOf(new Date()));
  const [teacherId, setTeacherId] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const teachers = useQuery({ queryKey: ['directory-teachers'], queryFn: () => api('/directory/teachers?q='), enabled: !!admin });
  const q = `weekStart=${week}${teacherId ? `&teacherId=${teacherId}` : ''}`;
  const data = useQuery({ queryKey: ['weekly', week, teacherId], queryFn: () => api(`/teacher/reports/weekly?${q}`), placeholderData: (p) => p });
  const courses: any[] = data.data?.courses ?? [];
  // Open on the most recent week that has data, so the page is never empty on a Monday morning.
  const autoStepped = React.useRef(0);
  React.useEffect(() => {
    if (data.data && !data.isPlaceholderData && !courses.length && autoStepped.current < 4 && !teacherId) {
      autoStepped.current++;
      setWeek((w) => shift(w, -7));
    } else if (data.data && courses.length) autoStepped.current = 99;
  }, [data.data, data.isPlaceholderData, courses.length, teacherId]);
  const tot = courses.reduce((a, c) => ({ held: a.held + c.held, onTime: a.onTime + c.onTime, late: a.late + c.late, absent: a.absent + c.absent }), { held: 0, onTime: 0, late: 0, absent: 0 });
  const rate = pct(tot.onTime + tot.late, tot.onTime + tot.late + tot.absent);
  const isCurrent = week === mondayOf(new Date());

  return (
    <div className="space-y-6">
      <Card className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Previous week" onClick={() => setWeek(shift(week, -7))}><ChevronLeft /></Button>
          <div className="flex min-w-[220px] items-center justify-center gap-2 text-sm font-semibold">
            <CalendarRange className="size-4 text-primary" />
            {fmt.date(week + 'T12:00:00Z')} – {fmt.date(shift(week, 6) + 'T12:00:00Z')}
          </div>
          <Button variant="ghost" size="icon" aria-label="Next week" disabled={isCurrent} onClick={() => setWeek(shift(week, 7))}><ChevronRight /></Button>
          {!isCurrent && <Button variant="link" size="sm" onClick={() => setWeek(mondayOf(new Date()))}>{t('report.thisWeek')}</Button>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {admin && (
            <Select className="h-9 w-56" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} aria-label={t('role.TEACHER')}>
              <option value="">{t('report.allTeachers')}</option>
              {(teachers.data?.items ?? []).map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          )}
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await download(`/teacher/reports/weekly.xlsx?${q}`, `weekly-${week}.xlsx`);
              } catch (e) {
                toast.error(errorMessage(e, t));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Download /> {t('report.downloadExcel')}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('report.lessonsHeld')} value={tot.held} icon={CalendarRange} />
        <Stat label={t('report.rate')} value={rate == null ? '–' : `${rate}%`} icon={TrendingUp} tone="success" hint={t('report.rateHint')} />
        <Stat label={t('status.LATE')} value={tot.late} icon={Clock} tone="warning" />
        <Stat label={t('status.ABSENT')} value={tot.absent} icon={UserX} tone="destructive" />
      </div>

      {data.isLoading ? (
        <Spinner />
      ) : data.error ? (
        <EmptyState title={errorMessage(data.error, t)} />
      ) : !courses.length ? (
        <EmptyState icon={CalendarRange} title={t('report.emptyWeek')} description={t('report.emptyWeekHint')} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {courses.map((c) => {
            const total = c.onTime + c.late + c.absent;
            const r = pct(c.onTime + c.late, total);
            return (
              <Card key={c.course.id}>
                <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">{c.course.code}</p>
                    <CardTitle className="truncate">{c.course.title}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">{t('report.heldCancelled', { held: c.held, cancelled: c.cancelled })}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold tabular">{r == null ? '–' : `${r}%`}</p>
                    <p className="text-xs text-muted-foreground">{t('report.rate')}</p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <StackedBar onTime={c.onTime} late={c.late} absent={c.absent} />
                  <div className="divide-y rounded-lg border">
                    {c.lessons.map((l: any) => (
                      <Link key={l.id} href={`/teacher/lessons/${l.id}`} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50">
                        <span className="w-28 shrink-0 font-medium">{fmt.weekday(l.startsAt)}</span>
                        <span className="w-12 shrink-0 tabular text-muted-foreground">{fmt.time(l.startsAt)}</span>
                        <div className="flex-1"><StackedBar onTime={l.onTime} late={l.late} absent={l.absent} thin /></div>
                        <span className="flex w-14 items-center justify-end gap-1 tabular text-xs text-muted-foreground"><Users className="size-3" />{l.onTime + l.late}/{l.enrolled}</span>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function StackedBar({ onTime, late, absent, thin }: { onTime: number; late: number; absent: number; thin?: boolean }) {
  const t = useT();
  const total = onTime + late + absent || 1;
  const seg = [
    { v: onTime, cls: 'bg-success', label: t('status.PRESENT') },
    { v: late, cls: 'bg-warning', label: t('status.LATE') },
    { v: absent, cls: 'bg-destructive/80', label: t('status.ABSENT') },
  ];
  return (
    <div className="space-y-1.5">
      <div className={`flex w-full overflow-hidden rounded-full bg-muted ${thin ? 'h-1.5' : 'h-2.5'}`} role="img" aria-label={seg.map((s) => `${s.label} ${s.v}`).join(', ')}>
        {seg.map((s) => s.v > 0 && <div key={s.label} className={s.cls} style={{ width: `${(s.v / total) * 100}%` }} title={`${s.label}: ${s.v}`} />)}
      </div>
      {!thin && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {seg.map((s) => <span key={s.label} className="flex items-center gap-1.5"><span className={`size-2 rounded-full ${s.cls}`} />{s.label} <span className="tabular font-semibold text-foreground">{s.v}</span></span>)}
        </div>
      )}
    </div>
  );
}
