'use client';
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, KeyRound, LogOut, MailPlus, Plus, Search, ShieldOff, ShieldCheck, Upload } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { Alert, EmptyState, PageHeader, Spinner, Table, TBody, TD, TH, THead, TR } from '@/components/ui/misc';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
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
  const [onboarding, setOnboarding] = React.useState<{ name: string; activationUrl: string | null; tempPassword: string | null } | null>(null);
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
            <THead><TR><TH className="pl-5">{t('common.name')}</TH><TH>{t('common.status')}</TH><TH>ID</TH><TH>Last sign-in</TH><TH className="pr-5 text-right">{t('common.actions')}</TH></TR></THead>
            <TBody>
              {users.data.items.map((u: any) => (
                <TR key={u.id}>
                  <TD className="pl-5">
                    <p className="font-medium">{u.name} <Badge variant="outline" className="ml-1">{t(`role.${u.role}` as MessageKey)}</Badge></p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </TD>
                  <TD><Badge variant={statusVariant[u.status]}>{u.status.toLowerCase()}</Badge>{u.activeSessions > 0 && <span className="ml-2 text-xs text-muted-foreground">{u.activeSessions} device(s)</span>}</TD>
                  <TD className="tabular text-sm text-muted-foreground">{u.studentProfile?.facultyNumber ?? u.universityId ?? '—'}</TD>
                  <TD className="text-sm text-muted-foreground">{u.lastLoginAt ? fmt.relative(u.lastLoginAt) : '—'}</TD>
                  <TD className="pr-5">
                    <div className="flex justify-end gap-1">
                      {u.status === 'INVITED' && (
                        <Button size="sm" variant="ghost" title={t('admin.resendInvite')} onClick={async () => { const r = await act(() => api(`/admin/users/${u.id}/resend-invite`, { method: 'POST' })); if (r) setOnboarding({ name: u.name, ...r }); }}><MailPlus /></Button>
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
              onCreated({ name: r.user.name, activationUrl: r.activationUrl, tempPassword: r.tempPassword });
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

function OnboardingDialog({ value, onClose }: { value: { name: string; activationUrl: string | null; tempPassword: string | null } | null; onClose: () => void }) {
  const t = useT();
  const secret = value?.activationUrl ?? value?.tempPassword ?? '';
  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={value?.activationUrl ? t('admin.inviteLink') : t('admin.tempPassword')} description={`${value?.name ?? ''} · ${t('admin.inviteLinkHint')}`}>
        <div className="flex items-center gap-2 rounded-lg border bg-muted p-3">
          <KeyRound className="size-4 shrink-0 text-muted-foreground" />
          <code className="min-w-0 flex-1 break-all text-xs">{secret}</code>
          <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(secret).then(() => toast.success(t('common.copied')))}><Copy /> {t('common.copy')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
