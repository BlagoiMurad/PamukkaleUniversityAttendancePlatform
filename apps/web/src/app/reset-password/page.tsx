'use client';
import * as React from 'react';
import { AuthLayout } from '@/components/auth-layout';
import { useT } from '@/lib/i18n';
import { TokenPasswordForm } from '@/components/token-password-form';

export default function ResetPage() {
  const t = useT();
  return (
    <AuthLayout title={t('reset.title')}>
      <React.Suspense>
        <TokenPasswordForm endpoint="/auth/reset-password" doneKey="reset.done" />
      </React.Suspense>
    </AuthLayout>
  );
}
