'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, Clock, FileLock2, KeyRound, ScanLine, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { Alert, PageHeader, Spinner } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';

type Settings = Record<string, any>;

/** A toggle that reads as a sentence, so a policy change is obvious before it is saved. */
function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-secondary/50">
      <input type="checkbox" className="mt-0.5 size-4 accent-[hsl(var(--primary))]" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

function Num({ label, hint, value, onChange, min, max, nullable }: { label: string; hint?: string; value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; nullable?: boolean }) {
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        min={min}
        max={max}
        value={value ?? ''}
        placeholder={nullable ? '—' : undefined}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return onChange(nullable ? null : 0);
          onChange(Number(raw));
        }}
      />
    </Field>
  );
}

export default function SettingsPage() {
  const t = useT();
  const qc = useQueryClient();
  const q = useQuery<Settings>({ queryKey: ['admin-settings'], queryFn: () => api('/admin/settings') });
  const [draft, setDraft] = React.useState<Settings | null>(null);

  // Load the server's values once, then edit locally until Save.
  React.useEffect(() => {
    if (q.data && !draft) setDraft(q.data.settings ?? q.data);
  }, [q.data, draft]);

  const save = useMutation({
    mutationFn: (body: Settings) => api('/admin/settings', { method: 'PATCH', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      qc.invalidateQueries({ queryKey: ['me'] });
      toast.success(t('common.saved'));
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  if (q.isLoading || !draft) return <Spinner />;
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d!, [k]: v }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(q.data?.settings ?? q.data);

  return (
    <>
      <PageHeader
        title={t('nav.settings')}
        description={t('settings.subtitle')}
        actions={
          <Button loading={save.isPending} disabled={!dirty} onClick={() => save.mutate(draft)}>
            <Save /> {t('common.save')}
          </Button>
        }
      />
      {dirty && <Alert variant="warning">{t('settings.unsaved')}</Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="size-4 text-primary" /> {t('settings.university')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label={t('settings.universityName')}><Input value={draft.universityName ?? ''} onChange={(e) => set('universityName', e.target.value)} /></Field>
            <Field label={t('settings.timeZone')} hint={t('settings.timeZoneHint')}><Input value={draft.universityTimeZone ?? ''} onChange={(e) => set('universityTimeZone', e.target.value)} /></Field>
            <Toggle label={t('settings.teacherCanCreateCourses')} checked={draft.teacherCanCreateCourses} onChange={(v) => set('teacherCanCreateCourses', v)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Clock className="size-4 text-primary" /> {t('settings.attendance')}</CardTitle>
            <CardDescription>{t('settings.attendanceHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Num label={t('settings.lateAfter')} hint={t('settings.lateAfterHint')} value={draft.lateAfterMinutes} onChange={(v) => set('lateAfterMinutes', v)} min={0} max={240} />
            <Num label={t('settings.checkinClose')} hint={t('settings.checkinCloseHint')} value={draft.checkinCloseAfterMinutes} onChange={(v) => set('checkinCloseAfterMinutes', v)} min={1} max={600} nullable />
            <Num label={t('settings.autoEnd')} hint={t('settings.autoEndHint')} value={draft.autoEndAfterScheduledMinutes} onChange={(v) => set('autoEndAfterScheduledMinutes', v)} min={0} max={600} />
            <Toggle label={t('settings.lateCountsAsPresent')} hint={t('settings.lateCountsHint')} checked={draft.lateCountsAsPresent} onChange={(v) => set('lateCountsAsPresent', v)} />
            <Toggle label={t('settings.excusedInDenominator')} checked={draft.excusedCountsInDenominator} onChange={(v) => set('excusedCountsInDenominator', v)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ScanLine className="size-4 text-primary" /> {t('settings.marker')}</CardTitle>
            <CardDescription>{t('settings.markerHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Num label={t('settings.markerGrace')} hint={t('settings.markerGraceHint')} value={draft.markerGraceMs} onChange={(v) => set('markerGraceMs', v)} min={0} max={2000} />
            <Num label={t('settings.challengeTtl')} value={draft.challengeTtlSeconds} onChange={(v) => set('challengeTtlSeconds', v)} min={20} max={300} />
            <Num label={t('settings.challengeAttempts')} value={draft.challengeMaxAttempts} onChange={(v) => set('challengeMaxAttempts', v)} min={1} max={100} />
            <Toggle label={t('settings.allowManual')} hint={t('settings.allowManualHint')} checked={draft.allowManualCheckinRequests} onChange={(v) => set('allowManualCheckinRequests', v)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="size-4 text-primary" /> {t('settings.accounts')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label={t('settings.onboarding')} hint={t('settings.onboardingHint')}>
              <Select value={draft.onboardingMode} onChange={(e) => set('onboardingMode', e.target.value)}>
                <option value="TEMP_PASSWORD">{t('settings.onboardingTemp')}</option>
                <option value="ACTIVATION_LINK">{t('settings.onboardingLink')}</option>
              </Select>
            </Field>
            <Num label={t('settings.activationTtl')} value={draft.activationTtlHours} onChange={(v) => set('activationTtlHours', v)} min={1} max={336} />
            <Toggle label={t('settings.studentSingleSession')} hint={t('settings.studentSingleSessionHint')} checked={draft.studentSingleSession} onChange={(v) => set('studentSingleSession', v)} />
            <Num label={t('settings.teacherMaxSessions')} hint={t('settings.teacherMaxSessionsHint')} value={draft.teacherMaxSessions} onChange={(v) => set('teacherMaxSessions', v)} min={0} max={50} />
            <Field label={t('settings.studentEditable')} hint={t('settings.studentEditableHint')}>
              <div className="space-y-2">
                {['name', 'preferredName', 'phone', 'locale'].map((f) => (
                  <Toggle
                    key={f}
                    label={f}
                    checked={(draft.studentEditableFields ?? []).includes(f)}
                    onChange={(v) => {
                      const cur: string[] = draft.studentEditableFields ?? [];
                      set('studentEditableFields', v ? [...cur, f] : cur.filter((x) => x !== f));
                    }}
                  />
                ))}
              </div>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileLock2 className="size-4 text-primary" /> {t('settings.corrections')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Num label={t('settings.lockAfter')} hint={t('settings.lockAfterHint')} value={draft.lockAfterHours} onChange={(v) => set('lockAfterHours', v)} min={0} max={1440} />
            <Toggle label={t('settings.editAfterLock')} checked={draft.teacherCanEditAfterLock} onChange={(v) => set('teacherCanEditAfterLock', v)} />
            <Toggle label={t('settings.correctionsNeedApproval')} checked={draft.teacherCorrectionsNeedApproval} onChange={(v) => set('teacherCorrectionsNeedApproval', v)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Trash2 className="size-4 text-primary" /> {t('settings.retention')}</CardTitle>
            <CardDescription>{t('settings.retentionHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Num label={t('settings.attendanceRetention')} value={draft.attendanceRetentionDays} onChange={(v) => set('attendanceRetentionDays', v)} min={30} nullable />
            <Num label={t('settings.auditRetention')} value={draft.auditRetentionDays} onChange={(v) => set('auditRetentionDays', v)} min={30} nullable />
            <Num label={t('settings.requestRetention')} value={draft.requestRetentionDays} onChange={(v) => set('requestRetentionDays', v)} min={30} nullable />
            <Num label={t('settings.technicalRetention')} value={draft.technicalRetentionDays} onChange={(v) => set('technicalRetentionDays', v)} min={1} max={365} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
