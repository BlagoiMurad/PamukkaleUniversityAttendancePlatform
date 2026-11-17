'use client';
import * as React from 'react';
import { AuthLayout } from '@/components/auth-layout';
import { TokenPasswordForm } from '@/components/token-password-form';
import { useT } from '@/lib/i18n';


export default function ActivatePage() {
  const t = useT();
  return (
    <AuthLayout title={t('activate.title')} subtitle={t('activate.subtitle')}>
      <React.Suspense>
        <TokenPasswordForm endpoint="/auth/activate" doneKey="activate.done" />
      </React.Suspense>
    </AuthLayout>
  );
}
