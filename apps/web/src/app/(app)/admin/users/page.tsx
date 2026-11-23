'use client';
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, KeyRound, Link as LinkIcon, LogOut, Mail, MailPlus, Plus, Search, ShieldOff, ShieldCheck, Upload, UserRound } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { Alert, EmptyState, PageHeader, Spinner, Table, TBody, TD, TH, THead, TR } from '@/components/ui/misc';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useT, type MessageKey } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import { useFormat } from '@/lib/format';

const statusVariant: Record<string, any> = { ACTIVE: 'success', INVITED: 'warning', SUSPENDED: 'destructive', ARCHIVED: 'muted' };

export default function UsersPage() {
  const t = useT();
  const fmt = useFormat();
  const qc = useQueryClient();
  const [q, setQ] = React.useState('');
  const [role, setRole] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [create, setCreate] = React.useState(false);
  const [onboarding, setOnboarding] = React.useState<{ name: string; email: string; activationUrl: string | null; tempPassword: string | null } | null>(null);
  const users = useQuery({
    queryKey: ['users', q, role, status, page],
    queryFn: () => api(`/admin/users?q=${encodeURIComponent(q)}&role=${role}&status=${status}&page=${page}&pageSize=25`),
    placeholderData: (p) => p,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });
  const act = async (fn: () => Promise<any>, msg?: string) => {
    try {
      const r = await fn();
      refresh();
      if (msg) toast.success(msg);
      return r;
    } catch (e) {
      toast.error(errorMessage(e, t));
    }
  };
  const pages = users.data ? Math.max(1, Math.ceil(users.data.total / users.data.pageSize)) : 1;

  return (
    <div>
      <PageHeader
        title={t('admin.users')}
        actions={
          <>
            <Button variant="outline" asChild><Link href="/admin/import"><Upload /> {t('nav.import')}</Link></Button>
            <Button onClick={() => setCreate(true)}><Plus /> {t('admin.newUser')}</Button>
          </>
        }
      />
      <Card>
        <div className="flex flex-wrap gap-2 border-b p-3">
          <div className="relative min-w-[220px] flex-1"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" placeholder={t('common.search')} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
          <Select className="w-40" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
            <option value="">{t('common.all')}</option>
            {['STUDENT', 'TEACHER', 'ADMIN'].map((r) => <option key={r} value={r}>{t(`role.${r}` as MessageKey)}</option>)}
          </Select>
          <Select className="w-40" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">{t('common.all')}</option>
            {['ACTIVE', 'INVITED', 'SUSPENDED', 'ARCHIVED'].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
          </Select>
        </div>
        {users.isLoading ? (
          <Spinner />
        ) : !users.data?.items.length ? (
          <div className="p-5"><EmptyState title="—" /></div>
        ) : (
          <Table>
            <THead><TR><TH className="pl-5">{t('common.name')}</TH><TH>{t('common.status')}</TH><TH className="hidden md:table-cell">ID</TH><TH className="hidden lg:table-cell">Last sign-in</TH><TH className="pr-5 text-right">{t('common.actions')}</TH></TR></THead>
            <TBody>
              {users.data.items.map((u: any) => (
                <TR key={u.id}>
                  <TD className="pl-5">
                    <p className="font-medium">{u.name} <Badge variant="outline" className="ml-1">{t(`role.${u.role}` as MessageKey)}</Badge></p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </TD>
                  <TD><Badge variant={statusVariant[u.status]}>{u.status.toLowerCase()}</Badge>{u.activeSessions > 0 && <span className="ml-2 text-xs text-muted-foreground">{u.activeSessions} device(s)</span>}</TD>
                  <TD className="tabular hidden text-sm text-muted-foreground md:table-cell">{u.studentProfile?.facultyNumber ?? u.universityId ?? '—'}</TD>
                  <TD className="hidden text-sm text-muted-foreground lg:table-cell">{u.lastLoginAt ? fmt.relative(u.lastLoginAt) : '—'}</TD>
                  <TD className="pr-5">
                    <div className="flex justify-end gap-1">
                      {u.status === 'INVITED' && (
                        <Button size="sm" variant="ghost" title={t('admin.resendInvite')} onClick={async () => { const r = await act(() => api(`/admin/users/${u.id}/resend-invite`, { method: 'POST' })); if (r) setOnboarding({ name: u.name, email: u.email, ...r }); }}><MailPlus /></Button>
                      )}
                      <Button size="sm" variant="ghost" title={t('admin.revokeSessions')} onClick={() => act(() => api(`/admin/users/${u.id}/revoke-sessions`, { method: 'POST' }), t('common.saved'))}><LogOut /></Button>
                      {u.status === 'SUSPENDED' ? (
                        <Button size="sm" variant="ghost" title={t('admin.activate')} onClick={() => act(() => api(`/admin/users/${u.id}`, { method: 'PATCH', body: { status: 'ACTIVE' } }), t('common.saved'))}><ShieldCheck /></Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="text-destructive" title={t('admin.suspend')} onClick={() => act(() => api(`/admin/users/${u.id}`, { method: 'PATCH', body: { status: 'SUSPENDED' } }), t('common.saved'))}><ShieldOff /></Button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <div className="flex items-center justify-between border-t p-3 text-sm text-muted-foreground">
          <span>{users.data?.total ?? 0} users</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</Button>
            <span className="px-2 py-1">{page} / {pages}</span>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</Button>
          </div>
        </div>
      </Card>
      <CreateUserDialog open={create} onOpenChange={setCreate} onCreated={(r) => { refresh(); setOnboarding(r); }} />
      <OnboardingDialog value={onboarding} onClose={() => setOnboarding(null)} />
    </div>
  );
}

function CreateUserDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (r: any) => void }) {
  const t = useT();
  const empty = { email: '', name: '', role: 'STUDENT', universityId: '', facultyNumber: '', programme: '', year: '', group: '', department: '' };
  const [v, setV] = React.useState(empty);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => { if (open) { setV(empty); setErr(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('admin.newUser')}>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            try {
              const body: any = { email: v.email, name: v.name, role: v.role, universityId: v.universityId || null };
              if (v.role === 'STUDENT') Object.assign(body, { facultyNumber: v.facultyNumber || null, programme: v.programme || null, year: v.year ? Number(v.year) : null, group: v.group || null });
              if (v.role === 'TEACHER') body.department = v.department || null;
              const r = await api('/admin/users', { body });
              onOpenChange(false);
              onCreated({ name: r.user.name, email: r.user.email, activationUrl: r.activationUrl, tempPassword: r.tempPassword });
            } catch (e2) {
              setErr(errorMessage(e2, t));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label={t('common.name')} htmlFor="n"><Input id="n" required value={v.name} onChange={set('name')} /></Field></div>
            <div className="col-span-2"><Field label={t('common.email')} htmlFor="e"><Input id="e" type="email" required value={v.email} onChange={set('email')} /></Field></div>
            <Field label="Role" htmlFor="r"><Select id="r" value={v.role} onChange={set('role')}>{['STUDENT', 'TEACHER', 'ADMIN'].map((r) => <option key={r} value={r}>{t(`role.${r}` as MessageKey)}</option>)}</Select></Field>
            <Field label="University ID" htmlFor="u"><Input id="u" value={v.universityId} onChange={set('universityId')} /></Field>
            {v.role === 'STUDENT' && (
              <>
                <Field label={t('course.facultyNumber')} htmlFor="f"><Input id="f" required value={v.facultyNumber} onChange={set('facultyNumber')} /></Field>
                <Field label={t('course.group')} htmlFor="g"><Input id="g" value={v.group} onChange={set('group')} /></Field>
                <Field label="Programme" htmlFor="p"><Input id="p" value={v.programme} onChange={set('programme')} /></Field>
                <Field label="Year" htmlFor="y"><Input id="y" type="number" min={1} max={10} value={v.year} onChange={set('year')} /></Field>
              </>
            )}
            {v.role === 'TEACHER' && <div className="col-span-2"><Field label="Department" htmlFor="d"><Input id="d" value={v.department} onChange={set('department')} /></Field></div>}
          </div>
          {err && <Alert variant="destructive">{err}</Alert>}
          <div className="flex justify-end gap-2 pt-2"><Button type="submit" loading={busy}>{t('common.save')}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One line of the handover sheet: a label, the value, and its own copy button. */
function CopyRow({ label, value, icon: Icon, mono }: { label: string; value: string; icon: React.ComponentType<{ className?: string }>; mono?: boolean }) {
  const t = useT();
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn('min-w-0 break-all text-sm', mono && 'font-mono')}>{value}</p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="size-8 shrink-0"
        aria-label={`${t('common.copy')} ${label}`}
        onClick={() => navigator.clipboard.writeText(value).then(() => toast.success(t('common.copied')))}
      >
        <Copy />
      </Button>
    </div>
  );
}

/**
 * Shown after an account is created or an invitation is resent. The admin has to pass these
 * details on, so name, e-mail and the secret each copy on their own and there is one button
 * that copies the lot in a form that can be pasted straight into a message.
 */
function OnboardingDialog({ value, onClose }: { value: { name: string; email: string; activationUrl: string | null; tempPassword: string | null } | null; onClose: () => void }) {
  const t = useT();
  if (!value) return null;
  const isLink = !!value.activationUrl;
  const secret = value.activationUrl ?? value.tempPassword ?? '';
  const secretLabel = isLink ? t('admin.inviteLink') : t('admin.tempPassword');
  const all = `${t('common.name')}: ${value.name}\n${t('common.email')}: ${value.email}\n${secretLabel}: ${secret}`;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t('admin.onboardingTitle')} description={t('admin.onboardingHint')}>
        <div className="space-y-2">
          <CopyRow label={t('common.name')} value={value.name} icon={UserRound} />
          <CopyRow label={t('common.email')} value={value.email} icon={Mail} />
          <CopyRow label={secretLabel} value={secret} icon={isLink ? LinkIcon : KeyRound} mono={!isLink} />
        </div>
        <Alert variant="warning">{t('admin.onboardingWarning')}</Alert>
        <Button className="w-full" onClick={() => navigator.clipboard.writeText(all).then(() => toast.success(t('common.copied')))}>
          <Copy /> {t('admin.copyAll')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
