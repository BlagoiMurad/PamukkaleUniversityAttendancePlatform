'use client';
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { AuthLayout } from '@/components/auth-layout';
import { NewPasswordFields } from '@/components/password-fields';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import { homeFor, useMe } from '@/lib/auth';
import { safeReturnTo } from '@/lib/utils';

function ChangeForm() {
  const t = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const returnTo = useSearchParams().get('returnTo');
  const [current, setCurrent] = React.useState('');
  const [v, setV] = React.useState({ password: '', repeat: '' });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!me.isLoading && !me.data) router.replace('/login');
  }, [me.isLoading, me.data, router]);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (v.password !== v.repeat) return setError(t('password.mismatch'));
        setBusy(true);
        setError(null);
        try {
          await api('/auth/change-password', { body: { currentPassword: current, newPassword: v.password } });
          toast.success(t('password.changed'));
          await qc.invalidateQueries({ queryKey: ['me'] });
          router.replace(safeReturnTo(returnTo, homeFor(me.data?.user.role)));
        } catch (err) {
          setError(errorMessage(err, t));
        } finally {
          setBusy(false);
        }
      }}
    >
      {me.data?.user.mustChangePassword && <Alert variant="warning" icon={KeyRound}>{t('password.changeForced')}</Alert>}
      <Field label={t('password.current')} htmlFor="current">
        <Input id="current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <NewPasswordFields value={v} onChange={setV} />
      {error && <Alert variant="destructive">{error}</Alert>}
      <Button type="submit" className="w-full" size="lg" loading={busy}>{t('common.save')}</Button>
    </form>
  );
}

export default function ChangePasswordPage() {
  const t = useT();
  return (
    <AuthLayout title={t('password.changeTitle')}>
      <React.Suspense>
        <ChangeForm />
      </React.Suspense>
    </AuthLayout>
  );
}
