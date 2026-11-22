'use client';
import * as React from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, PageHeader, Table, TBody, TD, TH, THead, TR } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';

interface Row {
  rowNumber: number;
  email: string;
  name: string;
  facultyNumber?: string;
  programme?: string;
  year?: number;
  role: string;
  issues: string[];
}

export default function ImportPage() {
  const t = useT();
  const [preview, setPreview] = React.useState<{ batchId: string; rows: Row[]; summary: { total: number; valid: number; skipped: number } } | null>(null);
  const [done, setDone] = React.useState<{ created: number; skipped: number; failed: { email: string; reason: string }[] } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setDone(null);
    try {
      const form = new FormData();
      form.append('file', file);
      setPreview(await api('/admin/users/import/preview', { form }));
    } catch (e) {
      toast.error(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={t('import.title')} description={t('import.subtitle')} />

      {!preview && !done && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-primary" /> {t('import.pick')}
            </CardTitle>
            <CardDescription>{t('import.columns')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="grid cursor-pointer place-items-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors hover:border-primary hover:bg-primary/5"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void upload(f);
              }}
            >
              <Upload className="size-8 text-muted-foreground" />
              <p className="font-medium">{t('import.drop')}</p>
              <p className="text-sm text-muted-foreground">.xlsx · .csv</p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv,.tsv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = '';
              }}
            />
            {busy && <p className="text-center text-sm text-muted-foreground">{t('common.loading')}</p>}
          </CardContent>
        </Card>
      )}

      {preview && !done && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="success">{t('import.willCreate', { n: preview.summary.valid })}</Badge>
            {preview.summary.skipped > 0 && <Badge variant="warning">{t('import.willSkip', { n: preview.summary.skipped })}</Badge>}
          </div>
          {preview.summary.skipped > 0 && <Alert variant="warning" icon={AlertTriangle}>{t('import.skipHint')}</Alert>}
          <Card>
            <CardContent className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>#</TH>
                    <TH>{t('common.name')}</TH>
                    <TH>{t('common.email')}</TH>
                    <TH>{t('course.facultyNumber')}</TH>
                    <TH>{t('course.year')}</TH>
                    <TH>{t('common.status')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {preview.rows.map((r) => (
                    <TR key={r.rowNumber} className={r.issues.length ? 'bg-destructive/5' : undefined}>
                      <TD className="text-muted-foreground">{r.rowNumber}</TD>
                      <TD className="font-medium">{r.name}</TD>
                      <TD>{r.email}</TD>
                      <TD className="tabular">{r.facultyNumber ?? '—'}</TD>
                      <TD>{r.year ?? '—'}</TD>
                      <TD>
                        {r.issues.length ? <span className="text-sm text-destructive">{r.issues.join(', ')}</span> : <Badge variant="success">{t('import.ready')}</Badge>}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPreview(null)}>{t('common.cancel')}</Button>
            <Button
              loading={busy}
              disabled={!preview.summary.valid}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await api(`/admin/users/import/${preview.batchId}/commit`, { method: 'POST', body: {} });
                  setDone(r);
                  setPreview(null);
                } catch (e) {
                  toast.error(errorMessage(e, t));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t('import.commit', { n: preview.summary.valid })}
            </Button>
          </div>
        </div>
      )}

      {done && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-8 text-[hsl(var(--success))]" />
              <div>
                <p className="text-lg font-semibold">{t('import.done', { n: done.created })}</p>
                <p className="text-sm text-muted-foreground">{t('import.doneHint')}</p>
              </div>
            </div>
            {done.failed.length > 0 && (
              <Alert variant="destructive" title={t('import.failed', { n: done.failed.length })}>
                <ul className="list-inside list-disc text-sm">
                  {done.failed.map((f) => (
                    <li key={f.email}>{f.email}: {f.reason}</li>
                  ))}
                </ul>
              </Alert>
            )}
            <Button onClick={() => setDone(null)}>{t('import.another')}</Button>
          </CardContent>
        </Card>
      )}
    </>
  );
}
