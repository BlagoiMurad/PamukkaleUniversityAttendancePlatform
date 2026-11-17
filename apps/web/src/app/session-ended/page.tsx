'use client';
import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MonitorSmartphone } from 'lucide-react';
import { AuthLayout } from '@/components/auth-layout';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/misc';
import { useT, type MessageKey } from '@/lib/i18n';
import { en } from '@/lib/i18n/messages';
import { safeReturnTo } from '@/lib/utils';

function Body() {
  const t = useT();
  const p = useSearchParams();
  const reason = p.get('reason') ?? 'default';
  const key = (`revoked.${reason}` in en ? `revoked.${reason}` : 'revoked.default') as MessageKey;
  const returnTo = safeReturnTo(p.get('returnTo'), '/');
  return (
    <div className="space-y-5">
      <Alert variant="warning" icon={MonitorSmartphone}>{t(key)}</Alert>
      <Button asChild size="lg" className="w-full">
        <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>{t('revoked.signIn')}</Link>
      </Button>
    </div>
  );
}

export default function SessionEndedPage() {
  const t = useT();
  return (
    <AuthLayout title={t('revoked.title')}>
      <React.Suspense>
        <Body />
      </React.Suspense>
    </AuthLayout>
  );
}
