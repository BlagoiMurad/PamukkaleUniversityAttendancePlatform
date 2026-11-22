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
  const editable = u.role === 'STUDENT' ? me.data!.settings.studentEditableFields : ['name', 'preferredName', 'phone', 'locale'];
  const [v, setV] = React.useState({ name: u.name ?? '', preferredName: u.preferredName ?? '', phone: u.phone ?? '' });
  const [busy, setBusy] = React.useState(false);

  return (
    <div>
      <PageHeader title={t('profile.title')} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t('profile.details')}</CardTitle><CardDescription>{t('profile.managed')}</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              {!editable.includes('name') && (<><dt className="text-muted-foreground">{t('common.name')}</dt><dd className="font-medium">{u.name}</dd></>)}
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
                  await api('/me', {
                    method: 'PATCH',
                    body: {
                      ...(editable.includes('name') ? { name: v.name.trim() } : {}),
                      preferredName: v.preferredName || null,
                      phone: v.phone || null,
                    },
                  });
                  await qc.invalidateQueries({ queryKey: ['me'] });
                  toast.success(t('common.saved'));
                } catch (err) {
                  toast.error(errorMessage(err, t));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {editable.includes('name') && <Field label={t('common.name')} htmlFor="nm" hint={t('profile.nameHint')}><Input id="nm" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={120} required /></Field>}
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
        </div>
      </div>
    </div>
  );
}

