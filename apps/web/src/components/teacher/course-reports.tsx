'use client';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Field, Input } from '../ui/input';
import { Spinner, Table, TBody, TD, TH, THead, TR } from '../ui/misc';
import { api, download } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** "Присъствия и отчети" (spec 22): per-student summary + Excel export for a period. */
export function CourseReports({ courseId }: { courseId: string }) {
  const t = useT();
  const [from, setFrom] = React.useState(() => iso(new Date(Date.now() - 120 * 86400_000)));
  const [to, setTo] = React.useState(() => iso(new Date()));
  const [busy, setBusy] = React.useState(false);
  const summary = useQuery({ queryKey: ['course-summary', courseId, from, to], queryFn: () => api(`/teacher/courses/${courseId}/reports/summary?from=${from}&to=${to}`) });
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="size-4" /> {t('course.tabReports')}</CardTitle>
          <CardDescription>RPT-01 · {from} → {to}</CardDescription>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="From" htmlFor="rf"><Input id="rf" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" /></Field>
          <Field label="To" htmlFor="rt"><Input id="rt" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" /></Field>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await download(`/teacher/courses/${courseId}/reports/attendance.xlsx?from=${from}&to=${to}`, `attendance-${from}-${to}.xlsx`);
              } catch (e) {
                toast.error(errorMessage(e, t));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Download /> Excel
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {summary.isLoading ? (
          <Spinner />
        ) : summary.error ? (
          <p className="px-5 text-sm text-muted-foreground">{errorMessage(summary.error, t)}</p>
        ) : !summary.data?.students?.length ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">{t('course.noLessons')}</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">{t('common.name')}</TH>
                <TH>{t('course.facultyNumber')}</TH>
                <TH className="text-right">{t('lesson.checkedIn')}</TH>
                <TH className="text-right">{t('status.LATE')}</TH>
                <TH className="text-right">{t('status.ABSENT')}</TH>
                <TH className="pr-5 text-right">%</TH>
              </TR>
            </THead>
            <TBody>
              {summary.data.students.map((s: any) => (
                <TR key={s.studentId}>
                  <TD className="pl-5 font-medium">{s.name}</TD>
                  <TD className="tabular text-muted-foreground">{s.facultyNumber ?? '—'}</TD>
                  <TD className="tabular text-right">{s.onTime}</TD>
                  <TD className="tabular text-right">{s.late}</TD>
                  <TD className="tabular text-right">{s.absent}</TD>
                  <TD className="tabular pr-5 text-right font-semibold">{s.rate == null ? 'N/A' : `${s.rate}%`}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
