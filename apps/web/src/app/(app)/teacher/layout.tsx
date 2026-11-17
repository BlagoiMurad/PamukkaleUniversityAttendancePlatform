'use client';
import { RequireAuth } from '@/lib/auth';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RequireAuth roles={['TEACHER','ADMIN']}>{() => children}</RequireAuth>;
}
