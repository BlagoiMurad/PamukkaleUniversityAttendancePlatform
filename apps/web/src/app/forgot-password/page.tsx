'use client';
import * as React from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { AuthLayout } from '@/components/auth-layout';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';

export default function ForgotPage() {
  const t = useT();
  const [email, setEmail] = React.useState('');
  const [sent, setSent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <AuthLayout title={t('forgot.title')} subtitle={t('forgot.subtitle')}>
      {sent ? (
        <Alert variant="success" icon={MailCheck}>{t('forgot.sent')}</Alert>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api('/auth/forgot-password', { body: { email } });
              setSent(true);
            } catch (err) {
              setError(errorMessage(err, t));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label={t('login.email')} htmlFor="email">
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </Field>
          {error && <Alert variant="destructive">{error}</Alert>}
          <Button type="submit" className="w-full" size="lg" loading={busy}>{t('forgot.submit')}</Button>
        </form>
      )}
      <div className="mt-6 text-center"><Link href="/login" className="text-sm font-medium text-primary hover:underline">{t('common.back')}</Link></div>
    </AuthLayout>
  );
}
