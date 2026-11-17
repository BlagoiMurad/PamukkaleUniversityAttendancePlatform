'use client';
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Copy, Download, FileSpreadsheet, FileUp, History, Link2, RefreshCw, SkipForward, UserPlus, UploadCloud } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, PageHeader, Stat, Table, TBody, TD, TH, THead, TR } from '@/components/ui/misc';
import { api, download } from '@/lib/api';
import { useT, type MessageKey } from '@/lib/i18n';
import { useFormat } from '@/lib/format';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

const ACTION_TONE: Record<string, any> = { CREATE: 'success', ENROLL_ONLY: 'default', SKIP: 'muted', ERROR: 'destructive' };

export default function ImportPage() {
  const t = useT();
  const fmt = useFormat();
  const qc = useQueryClient();
  const [file, setFile] = React.useState<File | null>(null);
  const [role, setRole] = React.useState('STUDENT');
  const [courseCode, setCourseCode] = React.useState('');
  const [sendInvites, setSendInvites] = React.useState(true);
  const [preview, setPreview] = React.useState<any>(null);
  const [result, setResult] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  const [filter, setFilter] = React.useState('');
  const [drag, setDrag] = React.useState(false);
  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api('/courses') });
  const history = useQuery({ queryKey: ['imports'], queryFn: () => api('/admin/users/import') });
  const step = result ? 3 : preview ? 2 : 1;

  const runPreview = async (f: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', f);
      form.append('role', role);
      if (courseCode) form.append('courseCode', courseCode);
      setPreview(await api('/admin/users/import/preview', { form, timeoutMs: 60_000 }));
      setFilter('');
    } catch (e) {
      toast.error(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  };
  const commit = async () => {
    setBusy(true);
    try {
      setResult(await api(`/admin/users/import/${preview.batchId}/commit`, { body: { sendInvites }, timeoutMs: 120_000 }));
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['imports'] });
    } catch (e) {
      toast.error(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  };
  const reset = () => { setFile(null); setPreview(null); setResult(null); };
  const pick = (f?: File | null) => { if (f) { setFile(f); setPreview(null); } };

  const steps = [t('import.step1'), t('import.step2'), t('import.step3')];
  const rows: any[] = preview?.rows ?? [];
  const shown = filter ? rows.filter((r) => r.action === filter) : rows;
  const links = (result?.report ?? []).filter((r: any) => r.activationUrl || r.tempPassword);

  return (
    <div>
      <PageHeader
        title={t('import.title')}
        description={t('import.subtitle')}
        actions={<Button variant="outline" onClick={() => download('/admin/users/import/template.csv', 'users-template.csv')}><Download /> {t('import.template')}</Button>}
      />

      <ol className="mb-6 flex items-center gap-2">
        {steps.map((s, i) => {
          const n = i + 1;
          const done = step > n || (step === steps.length && n === steps.length);
          return (
            <li key={s} className="flex flex-1 items-center gap-2">
              <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors', done ? 'bg-success text-success-foreground' : step === n ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' : 'bg-muted text-muted-foreground')}>
                {done ? <Check className="size-4" /> : n}
              </span>
              <span className={cn('hidden text-sm font-medium sm:inline', step === n ? 'text-foreground' : 'text-muted-foreground')}>{s}</span>
              {n < steps.length && <span className={cn('h-0.5 flex-1 rounded', done ? 'bg-success' : 'bg-border')} />}
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card>
            <CardContent className="p-5">
              <label
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
                className={cn('flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors', drag ? 'border-primary bg-primary/5' : 'hover:border-primary/50 hover:bg-muted/40')}
              >
                <input type="file" accept=".csv,.xlsx" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
                <span className="rounded-2xl bg-primary/10 p-4 text-primary">{file ? <FileSpreadsheet className="size-8" /> : <UploadCloud className="size-8" />}</span>
                {file ? (
                  <>
                    <p className="font-semibold">{file.name}</p>
                    <p className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(1)} KB · {t('import.changeFile')}</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold">{t('import.drop')}</p>
                    <p className="text-sm text-muted-foreground">{t('import.dropHint')}</p>
                  </>
                )}
              </label>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label={t('import.defaultRole')} htmlFor="ir" hint={t('import.defaultRoleHint')}>
                  <Select id="ir" value={role} onChange={(e) => setRole(e.target.value)}>
                    {['STUDENT', 'TEACHER'].map((r) => <option key={r} value={r}>{t(`role.${r}` as MessageKey)}</option>)}
                  </Select>
                </Field>
                <Field label={t('import.enrollInto')} htmlFor="ic" hint={t('import.enrollIntoHint')}>
                  <Select id="ic" value={courseCode} onChange={(e) => setCourseCode(e.target.value)}>
                    <option value="">{t('import.noCourse')}</option>
                    {[...new Map((courses.data?.items ?? []).map((c: any) => [c.code, c])).values()].map((c: any) => <option key={c.id} value={c.code}>{c.code} · {c.title}</option>)}
                  </Select>
                </Field>
              </div>
              <div className="mt-5 flex justify-end">
                <Button size="lg" disabled={!file} loading={busy} onClick={() => file && runPreview(file)}><FileUp /> {t('import.check')}</Button>
              </div>
            </CardContent>
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>{t('import.columns')}</CardTitle><CardDescription>{t('import.columnsHint')}</CardDescription></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {[['email', true], ['name', true], ['faculty_number', true], ['role', false], ['university_id', false], ['programme', false], ['year', false], ['group', false], ['department', false], ['course_code', false]].map(([c, req]) => (
                  <div key={c as string} className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-1.5">
                    <code className="text-xs">{c as string}</code>
                    {req ? <Badge variant="default">{t('import.required')}</Badge> : <span className="text-xs text-muted-foreground">{t('import.optional')}</span>}
                  </div>
                ))}
              </CardContent>
            </Card>
            <History_ items={history.data?.items} fmt={fmt} t={t} />
          </div>
        </div>
      )}

      {step === 2 && preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={t('import.willCreate')} value={preview.summary.create} icon={UserPlus} tone="success" />
            <Stat label={t('import.willEnroll')} value={preview.summary.enrollOnly} icon={Link2} />
            <Stat label={t('import.willSkip')} value={preview.summary.skip} icon={SkipForward} />
            <Stat label={t('import.withErrors')} value={preview.summary.errors} icon={AlertTriangle} tone="destructive" />
          </div>
          {preview.summary.errors > 0 && <Alert variant="warning" icon={AlertTriangle} title={t('import.errorsTitle', { count: preview.summary.errors })}>{t('import.errorsHint')}</Alert>}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
              <div className="flex flex-wrap gap-1.5">
                {['', 'CREATE', 'ENROLL_ONLY', 'SKIP', 'ERROR'].map((a) => (
                  <button key={a || 'all'} onClick={() => setFilter(a)} className={cn('rounded-full border px-3 py-1 text-xs font-medium', filter === a ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary')}>
                    {a ? t(`import.action.${a}` as MessageKey) : t('common.all')} <span className="tabular">{a ? rows.filter((r) => r.action === a).length : rows.length}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{preview.fileName} · {t('import.mapped')}: {Object.entries(preview.summary.columns).map(([k, v]) => `${v}→${k}`).join(', ')}</p>
            </div>
            <div className="max-h-[480px] overflow-y-auto">
              <Table>
                <THead><TR><TH className="pl-4">#</TH><TH>{t('common.name')}</TH><TH>{t('common.email')}</TH><TH>{t('course.facultyNumber')}</TH><TH>Role</TH><TH>{t('nav.courses')}</TH><TH className="pr-4">{t('common.status')}</TH></TR></THead>
                <TBody>
                  {shown.map((r) => (
                    <TR key={r.line} className={r.action === 'ERROR' ? 'bg-destructive/5' : undefined}>
                      <TD className="pl-4 tabular text-xs text-muted-foreground">{r.line}</TD>
                      <TD className="font-medium">{r.name || '—'}</TD>
                      <TD className="text-sm">{r.email || '—'}</TD>
                      <TD className="tabular text-sm">{r.facultyNumber ?? '—'}</TD>
                      <TD className="text-xs">{r.role}</TD>
                      <TD className="text-xs">{r.courseCode ?? '—'}</TD>
                      <TD className="pr-4">
                        <Badge variant={ACTION_TONE[r.action]}>{t(`import.action.${r.action}` as MessageKey)}</Badge>
                        {r.errors.length > 0 && <p className="mt-1 text-xs text-destructive">{r.errors.join(' · ')}</p>}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </Card>
          <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={sendInvites} onCheckedChange={setSendInvites} label={t('import.sendInvites')} />
              <span><span className="font-medium">{t('import.sendInvites')}</span><br /><span className="text-xs text-muted-foreground">{t('import.sendInvitesHint')}</span></span>
            </label>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setPreview(null)}><ArrowLeft /> {t('import.back')}</Button>
              <Button size="lg" loading={busy} disabled={!preview.summary.create && !preview.summary.enrollOnly} onClick={commit}>
                <Check /> {t('import.commit', { count: preview.summary.create + preview.summary.enrollOnly })}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {step === 3 && result && (
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="flex flex-col items-center gap-3 bg-gradient-to-br from-success/15 via-card to-card p-8 text-center">
              <span className="rounded-full bg-success/15 p-3 text-success"><CheckCircle2 className="size-8" /></span>
              <h2 className="text-xl font-bold">{t('import.done')}</h2>
              <div className="flex flex-wrap justify-center gap-2">
                {Object.entries(result.counts).map(([k, v]) => <Badge key={k} variant={k === 'FAILED' ? 'destructive' : k === 'CREATED' ? 'success' : 'muted'}>{t(`import.result.${k}` as MessageKey)}: {v as number}</Badge>)}
              </div>
            </div>
          </Card>
          {links.length > 0 && (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div><CardTitle>{t('import.linksTitle')}</CardTitle><CardDescription>{t('import.linksHint')}</CardDescription></div>
                <Button
                  variant="outline"
                  onClick={() => {
                    const csv = 'email,activation_link_or_temp_password\n' + links.map((l: any) => `${l.email},${l.activationUrl ?? l.tempPassword}`).join('\n');
                    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
                    const a = Object.assign(document.createElement('a'), { href: url, download: 'activation-links.csv' });
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  <Download /> CSV
                </Button>
              </CardHeader>
              <CardContent className="max-h-80 space-y-1.5 overflow-y-auto">
                {links.map((l: any) => (
                  <div key={l.line} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                    <span className="w-56 shrink-0 truncate font-medium">{l.email}</span>
                    <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{l.activationUrl ?? l.tempPassword}</code>
                    <Button size="sm" variant="ghost" aria-label={t('common.copy')} onClick={() => navigator.clipboard.writeText(l.activationUrl ?? l.tempPassword).then(() => toast.success(t('common.copied')))}><Copy /></Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {result.report.some((r: any) => r.result === 'FAILED') && (
            <Alert variant="destructive" title={t('import.failedTitle')}>
              {result.report.filter((r: any) => r.result === 'FAILED').map((r: any) => <p key={r.line}>#{r.line} {r.email}: {r.message}</p>)}
            </Alert>
          )}
          <div className="flex justify-end"><Button onClick={reset}><RefreshCw /> {t('import.another')}</Button></div>
        </div>
      )}
    </div>
  );
}

function History_({ items, fmt, t }: { items?: any[]; fmt: ReturnType<typeof useFormat>; t: ReturnType<typeof useT> }) {
  if (!items?.length) return null;
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-4" /> {t('import.history')}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.slice(0, 6).map((b) => (
          <div key={b.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
            <div className="min-w-0"><p className="truncate text-sm font-medium">{b.fileName}</p><p className="text-xs text-muted-foreground">{fmt.dateTime(b.createdAt)}</p></div>
            {b.status === 'COMMITTED' ? <Badge variant="success">+{b.counts?.CREATED ?? 0}</Badge> : <Badge variant="muted">{t('import.notCommitted')}</Badge>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
