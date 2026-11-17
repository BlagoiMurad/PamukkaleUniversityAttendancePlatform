'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { homeFor, useMe } from '@/lib/auth';
import { Spinner } from '@/components/ui/misc';

export default function Home() {
  const me = useMe();
  const router = useRouter();
  React.useEffect(() => {
    if (me.isLoading) return;
    router.replace(me.data ? homeFor(me.data.user.role) : '/login');
  }, [me.isLoading, me.data, router]);
  return <Spinner className="min-h-dvh" />;
}
