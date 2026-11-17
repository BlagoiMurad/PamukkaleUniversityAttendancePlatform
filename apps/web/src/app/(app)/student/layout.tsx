'use client';
import { RequireAuth } from '@/lib/auth';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RequireAuth roles={['STUDENT']}>{() => children}</RequireAuth>;
}
