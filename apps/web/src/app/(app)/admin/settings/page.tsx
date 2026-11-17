'use client';
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, Clock, Database, FileSpreadsheet, Lock, RotateCcw, Save, ShieldCheck, Smartphone, UserPlus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Alert, PageHeader, Spinner } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { useT, type MessageKey } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

type FieldDef =
  | { key: string; type: 'bool' }
  | { key: string; type: 'number'; unit: string; min?: number; max?: number; nullable?: boolean }
  | { key: string; type: 'text' }
  | { key: string; type: 'select'; options: string[] };

const SECTIONS: { id: string; icon: any; q?: string; fields: FieldDef[] }[] = [
  { id: 'general', icon: Building2, fields: [{ key: 'universityName', type: 'text' }, { key: 'universityTimeZone', type: 'text' }] },
  {
    id: 'attendance',
    icon: Clock,
    q: 'Q3',
    fields: [
      { key: 'lateAfterMinutes', type: 'number', unit: 'min', min: 0, max: 240 },
      { key: 'checkinCloseAfterMinutes', type: 'number', unit: 'min', min: 1, max: 600, nullable: true },
      { key: 'markerGraceMs', type: 'number', unit: 'ms', min: 0, max: 2000 },
      { key: 'challengeTtlSeconds', type: 'number', unit: 's', min: 20, max: 300 },
      { key: 'challengeMaxAttempts', type: 'number', unit: '×', min: 1, max: 100 },
      { key: 'autoEndAfterScheduledMinutes', type: 'number', unit: 'min', min: 0, max: 600 },
      { key: 'allowManualCheckinRequests', type: 'bool' },
    ],
  },
  {
    id: 'corrections',
    icon: Lock,
    q: 'Q4',
    fields: [
      { key: 'lockAfterHours', type: 'number', unit: 'h', min: 0, max: 1440 },
      { key: 'teacherCanEditAfterLock', type: 'bool' },
      { key: 'teacherCorrectionsNeedApproval', type: 'bool' },
    ],
  },
  { id: 'devices', icon: Smartphone, q: 'Q6', fields: [{ key: 'studentSingleSession', type: 'bool' }, { key: 'teacherMaxSessions', type: 'number', unit: '#', min: 0, max: 50 }] },
  {
    id: 'accounts',
    icon: UserPlus,
    q: 'Q1 · Q2',
    fields: [
      { key: 'teacherCanCreateCourses', type: 'bool' },
      { key: 'onboardingMode', type: 'select', options: ['ACTIVATION_LINK', 'TEMP_PASSWORD'] },
      { key: 'activationTtlHours', type: 'number', unit: 'h', min: 1, max: 336 },
    ],
  },
  { id: 'security', icon: ShieldCheck, fields: [{ key: 'mfaRequiredForStaff', type: 'bool' }] },
  { id: 'reports', icon: FileSpreadsheet, fields: [{ key: 'lateCountsAsPresent', type: 'bool' }, { key: 'excusedCountsInDenominator', type: 'bool' }] },
  {
    id: 'retention',
    icon: Database,
    q: 'Q7',
    fields: [
      { key: 'attendanceRetentionDays', type: 'number', unit: 'days', min: 30, nullable: true },
      { key: 'auditRetentionDays', type: 'number', unit: 'days', min: 30, nullable: true },
      { key: 'requestRetentionDays', type: 'number', unit: 'days', min: 30, nullable: true },
      { key: 'technicalRetentionDays', type: 'number', unit: 'days', min: 1, max: 365 },
    ],
  },
];

export default function SettingsPage() {
  const t = useT();
  const qc = useQueryClient();
  const data = useQuery({ queryKey: ['admin-settings'], queryFn: () => api('/admin/settings') });
  const [draft, setDraft] = React.useState<Record<string, any>>({});
  const [busy, setBusy] = React.useState(false);
  const [active, setActive] = React.useState('general');
  if (data.isLoading || !data.data) return <Spinner />;
  const current = data.data.settings as Record<string, any>;
  const value = (k: string) => (k in draft ? draft[k] : current[k]);
  const dirty = Object.keys(draft).filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(current[k]));
  const set = (k: string, v: any) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      await api('/admin/settings', { method: 'PATCH', body: Object.fromEntries(dirty.map((k) => [k, draft[k]])) });
      setDraft({});
      await qc.invalidateQueries({ queryKey: ['admin-settings'] });
      await qc.invalidateQueries({ queryKey: ['me'] });
      toast.success(t('settings.saved'));
    } catch (e) {
      toast.error(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pb-24">
      <PageHeader title={t('settings.title')} description={t('settings.subtitle')} />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="hidden lg:block">
          <ul className="sticky top-20 space-y-1">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#s-${s.id}`} onClick={() => setActive(s.id)} className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors', active === s.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground')}>
                  <s.icon className="size-4" /> {t(`settings.section.${s.id}` as MessageKey)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-6">
          <Alert variant="info" icon={ShieldCheck}>{t('settings.policyNote')}</Alert>
          {SECTIONS.map((s) => (
            <Card key={s.id} id={`s-${s.id}`} className="scroll-mt-20">
              <CardHeader className="flex-row items-center gap-3 space-y-0 border-b pb-4">
                <span className="rounded-lg bg-primary/10 p-2 text-primary"><s.icon className="size-5" /></span>
                <div className="flex-1">
                  <CardTitle>{t(`settings.section.${s.id}` as MessageKey)}</CardTitle>
                  <CardDescription>{t(`settings.section.${s.id}.hint` as MessageKey)}</CardDescription>
                </div>
                {s.q && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{s.q}</span>}
              </CardHeader>
              <CardContent className="divide-y p-0">
                {s.fields.map((f) => {
                  const v = value(f.key);
                  const changed = dirty.includes(f.key);
                  return (
                    <div key={f.key} className={cn('flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between', changed && 'bg-primary/5')}>
                      <div className="min-w-0 space-y-0.5">
                        <label htmlFor={f.key} className="text-sm font-medium">{t(`settings.${f.key}` as MessageKey)}{changed && <span className="ml-2 text-xs text-primary">●</span>}</label>
                        <p className="text-xs text-muted-foreground">{t(`settings.${f.key}.hint` as MessageKey)}</p>
                      </div>
                      <div className="shrink-0">
                        {f.type === 'bool' && <Switch id={f.key} checked={!!v} onCheckedChange={(x) => set(f.key, x)} label={f.key} />}
                        {f.type === 'text' && <Input id={f.key} className="w-64" value={v ?? ''} onChange={(e) => set(f.key, e.target.value)} />}
                        {f.type === 'select' && (
                          <Select id={f.key} className="w-56" value={v} onChange={(e) => set(f.key, e.target.value)}>
                            {f.options.map((o) => <option key={o} value={o}>{t(`settings.opt.${o}` as MessageKey)}</option>)}
                          </Select>
                        )}
                        {f.type === 'number' && (
                          <div className="flex items-center gap-3">
                            {f.nullable && (
                              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Switch checked={v != null} onCheckedChange={(on) => set(f.key, on ? (current[f.key] ?? f.min ?? 1) : null)} label="enabled" />
                                {v == null ? t('settings.off') : t('settings.on')}
                              </label>
                            )}
                            <div className={cn('flex items-center rounded-lg border bg-card focus-within:ring-2 focus-within:ring-ring', v == null && 'opacity-40')}>
                              <input
                                id={f.key}
                                type="number"
                                className="h-10 w-24 rounded-l-lg bg-transparent px-3 text-right text-sm tabular outline-none"
                                min={f.min}
                                max={f.max}
                                disabled={v == null}
                                value={v ?? ''}
                                onChange={(e) => set(f.key, e.target.value === '' ? (f.nullable ? null : 0) : Number(e.target.value))}
                              />
                              <span className="border-l px-3 text-xs text-muted-foreground">{f.unit}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      {dirty.length > 0 && <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.15)] backdrop-blur animate-fade-in">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm"><span className="font-semibold">{t('settings.unsaved', { count: dirty.length })}</span></p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDraft({})}><RotateCcw /> {t('settings.discard')}</Button>
            <Button loading={busy} onClick={save}><Save /> {t('common.save')}</Button>
          </div>
        </div>
      </div>}
    </div>
  );
}
