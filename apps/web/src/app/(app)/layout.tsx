'use client';
import { AppShell } from '@/components/app-shell';
import { RequireAuth } from '@/lib/auth';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{(me) => <AppShell me={me}>{children}</AppShell>}</RequireAuth>;
}
