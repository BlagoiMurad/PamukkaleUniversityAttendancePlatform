'use client';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarRange, ChevronLeft, ChevronRight, Download, FileSpreadsheet } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Alert, EmptyState, PageHeader, Spinner, Stat, Table, TBody, TD, TH, THead, TR } from './ui/misc';
import { api, download } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useFormat } from '@/lib/format';
import { errorMessage } from '@/lib/errors';

/** Monday of the week the given date falls in, in the viewer's own timezone. */
function mondayOf(d: Date) {
  const copy = new Date(d);
  const dow = (copy.getDay() + 6) % 7; // 0 = Monday
  copy.setDate(copy.getDate() - dow);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * The weekly attendance summary. The server already aggregates per course, so this only has to
 * present it and hand over the same data as .xlsx.
 */
export function WeeklyReport() {
  const t = useT();
  const fmt = useFormat();
  const [week, setWeek] = React.useState(() => mondayOf(new Date()));
  const weekStart = iso(week);

  const q = useQuery({
    queryKey: ['weekly-report', weekStart],
    queryFn: () => api(`/teacher/reports/weekly?weekStart=${weekStart}`),
  });

  const shift = (days: number) => setWeek((w) => mondayOf(new Date(w.getTime() + days * 86400_000)));
  const courses: any[] = q.data?.courses ?? [];
  const totals = courses.reduce(
    (acc, c) => ({ held: acc.held + c.held, onTime: acc.onTime + c.onTime, late: acc.late + c.late, absent: acc.absent + c.absent }),
    { held: 0, onTime: 0, late: 0, absent: 0 },
  );
  const marked = totals.onTime + totals.late + totals.absent;
  const rate = marked ? Math.round(((totals.onTime + totals.late) / marked) * 100) : 0;

  return (
    <>
      <PageHeader
        title={t('nav.reports')}
        description={t('report.subtitle')}
        actions={
          <Button
            variant="outline"
            onClick={() => download(`/teacher/reports/weekly.xlsx?weekStart=${weekStart}`, `weekly_${weekStart}.xlsx`).catch((e) => toast.error(errorMessage(e, t)))}
          >
            <Download /> {t('report.excel')}
          </Button>
        }
      />

      {/* The date range is the flexible part so the row never pushes the page wider than the phone. */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" className="shrink-0" onClick={() => shift(-7)} aria-label={t('report.prevWeek')}><ChevronLeft /></Button>
        <span className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border bg-card px-3 py-2 text-center text-sm font-medium sm:flex-none sm:px-4">
          <CalendarRange className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{q.data ? `${fmt.date(q.data.weekStart)} – ${fmt.date(q.data.weekEnd)}` : weekStart}</span>
        </span>
        <Button variant="outline" size="icon" className="shrink-0" onClick={() => shift(7)} aria-label={t('report.nextWeek')}><ChevronRight /></Button>
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setWeek(mondayOf(new Date()))}>{t('report.thisWeek')}</Button>
      </div>

      {q.isLoading ? (
        <Spinner />
      ) : !courses.length ? (
        <EmptyState icon={FileSpreadsheet} title={t('report.noLessons')} description={t('report.noLessonsHint')} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <Stat label={t('report.held')} value={totals.held} />
            <Stat label={t('student.present')} value={totals.onTime} tone="success" />
            <Stat label={t('student.late')} value={totals.late} tone="warning" />
            <Stat label={t('teacher.attendanceRate')} value={`${rate}%`} />
          </div>

          {courses.map((c) => (
            <Card key={c.course.id}>
              <CardHeader>
                <CardTitle>{c.course.code} · {c.course.title}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {c.cancelled > 0 && <div className="px-5 pb-3"><Alert variant="warning">{t('report.cancelled', { n: c.cancelled })}</Alert></div>}
                <Table>
                  <THead>
                    <TR>
                      <TH>{t('lesson.startsAt')}</TH>
                      <TH className="hidden sm:table-cell">{t('course.tabStudents')}</TH>
                      <TH>{t('student.present')}</TH>
                      <TH>{t('student.late')}</TH>
                      <TH>{t('student.absent')}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {c.lessons.map((l: any) => (
                      <TR key={l.id}>
                        <TD className="text-sm sm:whitespace-nowrap">{fmt.dateTime(l.startsAt)}</TD>
                        <TD className="tabular hidden sm:table-cell">{l.enrolled}</TD>
                        <TD className="tabular text-[hsl(var(--success))]">{l.onTime}</TD>
                        <TD className="tabular text-[hsl(var(--warning))]">{l.late}</TD>
                        <TD className="tabular text-muted-foreground">{l.absent}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
