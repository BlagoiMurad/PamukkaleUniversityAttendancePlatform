'use client';
import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { NewPasswordFields } from '@/components/password-fields';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';

export function TokenPasswordForm({ endpoint, doneKey }: { endpoint: string; doneKey: 'activate.done' | 'reset.done' }) {
  const t = useT();
  const token = useSearchParams().get('token') ?? '';
  const [v, setV] = React.useState({ password: '', repeat: '' });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  if (done)
    return (
      <div className="space-y-4">
        <Alert variant="success" icon={CheckCircle2}>{t(doneKey)}</Alert>
        <Button asChild className="w-full" size="lg"><Link href="/login">{t('login.submit')}</Link></Button>
      </div>
    );
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (v.password !== v.repeat) return setError(t('password.mismatch'));
        setBusy(true);
        setError(null);
        try {
          await api(endpoint, { body: { token, password: v.password } });
          setDone(true);
        } catch (err) {
          setError(errorMessage(err, t));
        } finally {
          setBusy(false);
        }
      }}
    >
      <NewPasswordFields value={v} onChange={setV} />
      {error && <Alert variant="destructive">{error}</Alert>}
      <Button type="submit" className="w-full" size="lg" loading={busy} disabled={!token}>{t('common.save')}</Button>
    </form>
  );
}

