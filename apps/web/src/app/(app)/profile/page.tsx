'use client';
import * as React from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, Laptop, LogOut, ShieldCheck, Smartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { Alert, PageHeader, Spinner } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { useT, type MessageKey } from '@/lib/i18n';
import { useFormat } from '@/lib/format';
import { errorMessage } from '@/lib/errors';

export default function ProfilePage() {
  const t = useT();
  const fmt = useFormat();
  const qc = useQueryClient();
  const me = useMe();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api('/auth/sessions') });
  const u = me.data!.user;
  const editable = u.role === 'STUDENT' ? me.data!.settings.studentEditableFields : ['preferredName', 'phone', 'locale'];
  const [v, setV] = React.useState({ preferredName: u.preferredName ?? '', phone: u.phone ?? '' });
  const [busy, setBusy] = React.useState(false);

  return (
    <div>
      <PageHeader title={t('profile.title')} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t('profile.details')}</CardTitle><CardDescription>{t('profile.managed')}</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t('common.name')}</dt><dd className="font-medium">{u.name}</dd>
              <dt className="text-muted-foreground">{t('common.email')}</dt><dd className="font-medium">{u.email}</dd>
              <dt className="text-muted-foreground">Role</dt><dd><Badge variant="outline">{t(`role.${u.role}` as MessageKey)}</Badge></dd>
              {u.universityId && (<><dt className="text-muted-foreground">University ID</dt><dd className="tabular">{u.universityId}</dd></>)}
              {u.studentProfile?.facultyNumber && (<><dt className="text-muted-foreground">{t('course.facultyNumber')}</dt><dd className="tabular">{u.studentProfile.facultyNumber}</dd></>)}
              {u.studentProfile?.programme && (<><dt className="text-muted-foreground">Programme</dt><dd>{u.studentProfile.programme}{u.studentProfile.year ? ` · ${u.studentProfile.year}` : ''}{u.studentProfile.group ? ` · ${u.studentProfile.group}` : ''}</dd></>)}
              {u.teacherProfile?.department && (<><dt className="text-muted-foreground">Department</dt><dd>{u.teacherProfile.department}</dd></>)}
            </dl>
            <form
              className="space-y-3 border-t pt-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await api('/me', { method: 'PATCH', body: { preferredName: v.preferredName || null, phone: v.phone || null } });
                  await qc.invalidateQueries({ queryKey: ['me'] });
                  toast.success(t('common.saved'));
                } catch (err) {
                  toast.error(errorMessage(err, t));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {editable.includes('preferredName') && <Field label={t('profile.preferredName')} htmlFor="pn"><Input id="pn" value={v.preferredName} onChange={(e) => setV({ ...v, preferredName: e.target.value })} maxLength={100} /></Field>}
              {editable.includes('phone') && <Field label={t('profile.phone')} htmlFor="ph"><Input id="ph" type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} maxLength={40} /></Field>}
              <Button type="submit" loading={busy}>{t('common.save')}</Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>{t('profile.sessions')}</CardTitle>
              <Button variant="outline" size="sm" asChild><Link href="/change-password"><KeyRound /> {t('profile.changePassword')}</Link></Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {sessions.isLoading && <Spinner />}
              {(sessions.data?.items ?? []).filter((s: any) => !s.revokedAt).map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 rounded-lg border p-3">
                  {/iOS|Android/.test(s.deviceLabel ?? '') ? <Smartphone className="size-5 text-muted-foreground" /> : <Laptop className="size-5 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.deviceLabel} {s.current && <Badge className="ml-1">{t('profile.current')}</Badge>}</p>
                    <p className="text-xs text-muted-foreground">{t('profile.lastSeen', { time: fmt.relative(s.lastSeenAt) })}{s.ipCoarse ? ` · ${s.ipCoarse}` : ''}</p>
                  </div>
                  {!s.current && (
                    <Button size="sm" variant="ghost" onClick={() => api(`/auth/sessions/${s.id}`, { method: 'DELETE' }).then(() => sessions.refetch())}><LogOut /> {t('profile.signOutDevice')}</Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
          {u.role !== 'STUDENT' && <MfaCard enabled={u.mfaEnabled} />}
        </div>
      </div>
    </div>
  );
}

function MfaCard({ enabled }: { enabled: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const [setup, setSetup] = React.useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = React.useState('');
  const [pwd, setPwd] = React.useState('');
  const [err, setErr] = React.useState<string | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4" /> {t('login.mfaTitle')} {enabled && <Badge variant="success">on</Badge>}</CardTitle>
        <CardDescription>TOTP (Google Authenticator, Microsoft Authenticator, 1Password…)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {err && <Alert variant="destructive">{err}</Alert>}
        {enabled ? (
          <div className="flex gap-2">
            <Input type="password" placeholder={t('login.password')} value={pwd} onChange={(e) => setPwd(e.target.value)} />
            <Button variant="outline" onClick={() => api('/auth/mfa/disable', { body: { password: pwd } }).then(() => qc.invalidateQueries({ queryKey: ['me'] })).catch((e) => setErr(errorMessage(e, t)))}>Disable</Button>
          </div>
        ) : setup ? (
          <div className="space-y-3">
            <div className="mx-auto w-44 rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: setup.qr }} />
            <p className="break-all text-center font-mono text-xs text-muted-foreground">{setup.secret}</p>
            <div className="flex gap-2">
              <Input inputMode="numeric" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
              <Button onClick={() => api('/auth/mfa/enable', { body: { code } }).then(() => { setSetup(null); qc.invalidateQueries({ queryKey: ['me'] }); toast.success(t('common.saved')); }).catch((e) => setErr(errorMessage(e, t)))}>{t('login.mfaSubmit')}</Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const r = await api('/auth/mfa/setup', { method: 'POST' });
                setSetup({ secret: r.secret, qr: await QRCode.toString(r.otpauthUrl, { type: 'svg', margin: 1 }) });
              } catch (e) {
                setErr(errorMessage(e, t));
              }
            }}
          >
            Enable
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
