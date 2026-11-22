'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Info, LogIn, Smartphone } from 'lucide-react';
import { AuthLayout } from '@/components/auth-layout';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { deviceFingerprint } from '@/lib/device';
import { DeviceGate } from '@/components/device-gate';
import { useT } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import { homeFor, type Role } from '@/lib/auth';
import { safeReturnTo } from '@/lib/utils';
import { resetSocket } from '@/lib/socket';

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

function LoginForm() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const returnTo = params.get('returnTo');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  /** Set when the server says this browser must be confirmed, or is not the bound device. */
  const [device, setDevice] = React.useState<
    | { kind: 'bind'; setupToken: string }
    | { kind: 'blocked'; code: string; boundLabel: string | null; requestToken: string | null; pending: boolean }
    | null
  >(null);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const finish = async (res: { user: { role: Role }; mustChangePassword: boolean }) => {
    resetSocket();
    qc.removeQueries({ queryKey: ['me'] });
    const dest = safeReturnTo(returnTo, homeFor(res.user.role));
    if (res.mustChangePassword) router.replace(`/change-password?returnTo=${encodeURIComponent(dest)}`);
    else router.replace(dest);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    setBusy(true);
    try {
      const res = await api('/auth/login', { body: { ...values, fingerprint: deviceFingerprint() } });
      if (res.deviceSetupRequired) setDevice({ kind: 'bind', setupToken: res.setupToken });
      else if (res.deviceBlocked) setDevice({ kind: 'blocked', code: res.code, boundLabel: res.boundLabel, requestToken: res.requestToken, pending: res.pending });
      else await finish(res);
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  });

  // The device now exists and the cookie is set, so replaying the same credentials signs in.
  if (device) return <DeviceGate state={device} onBound={() => { setDevice(null); void onSubmit(); }} onExpired={() => { setDevice(null); void onSubmit(); }} />;



  return (
    <div className="space-y-5">
      {returnTo?.startsWith('/join/') && <Alert icon={Info}>{t('login.returnNotice')}</Alert>}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label={t('login.email')} htmlFor="email" error={form.formState.errors.email && t('login.email')}>
          <Input id="email" type="email" autoComplete="username" inputMode="email" autoFocus placeholder="name@pau.edu.tr" {...form.register('email')} aria-invalid={!!form.formState.errors.email} />
        </Field>
        <Field label={t('login.password')} htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" {...form.register('password')} />
        </Field>
        {error && <Alert variant="destructive">{error}</Alert>}
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          <LogIn /> {t('login.submit')}
        </Button>
        <div className="text-center">
          <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">{t('login.forgot')}</Link>
        </div>
      </form>
      <p className="flex gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground"><Smartphone className="size-4 shrink-0" /> {t('login.singleDevice')}</p>
      {process.env.NEXT_PUBLIC_SHOW_DEMO === 'true' && (
        <details className="rounded-lg border p-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium">{t('login.demo')}</summary>
          <p className="mt-2">admin@pau.edu.tr · teacher@pau.edu.tr · student@pau.edu.tr — Demo!Pass2026</p>
        </details>
      )}
    </div>
  );
}

export default function LoginPage() {
  const t = useT();
  return (
    <AuthLayout title={t('login.title')} subtitle={t('login.subtitle')}>
      <React.Suspense>
        <LoginForm />
      </React.Suspense>
    </AuthLayout>
  );
}
