'use client';
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { api, ApiError } from './api';
import { resetSocket } from './socket';

export type Role = 'ADMIN' | 'TEACHER' | 'STUDENT';
export interface Me {
  user: {
    id: string;
    email: string;
    name: string;
    preferredName: string | null;
    phone: string | null;
    locale: string;
    role: Role;
    status: string;
    universityId: string | null;
    mustChangePassword: boolean;
    studentProfile?: { facultyNumber: string | null; programme: string | null; year: number | null; group: string | null };
    teacherProfile?: { department: string | null; faculty: string | null; title: string | null };
  };
  sessionId: string;
  settings: {
    universityName: string;
    universityTimeZone: string;
    lateAfterMinutes: number;
    checkinCloseAfterMinutes: number | null;
    allowManualCheckinRequests: boolean;
    teacherCanCreateCourses: boolean;
    studentEditableFields: string[];
    onboardingMode: string;
  };
}

export function useMe() {
  return useQuery<Me | null>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api<Me>('/auth/me');
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.code === 'SESSION_REVOKED')) return null;
        throw e;
      }
    },
    staleTime: 60_000,
    retry: (count, e) => !(e instanceof ApiError && e.status < 500) && count < 2,
  });
}

export function homeFor(role?: Role) {
  return role === 'ADMIN' ? '/admin' : role === 'TEACHER' ? '/teacher' : '/student';
}

export function useLogout() {
  const qc = useQueryClient();
  const router = useRouter();
  return async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    resetSocket();
    qc.clear();
    router.replace('/login');
  };
}

/** Listens for global auth events (revoked session, forced password change). */
export function AuthEvents() {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  React.useEffect(() => {
    const onRevoked = (e: Event) => {
      const reason = (e as CustomEvent).detail?.reason ?? 'default';
      resetSocket();
      qc.setQueryData(['me'], null);
      if (!pathname.startsWith('/session-ended')) router.replace(`/session-ended?reason=${encodeURIComponent(reason)}&returnTo=${encodeURIComponent(pathname)}`);
    };
    const onPwd = () => {
      if (!pathname.startsWith('/change-password')) router.replace(`/change-password?returnTo=${encodeURIComponent(pathname)}`);
    };
    window.addEventListener('auth:revoked', onRevoked);
    window.addEventListener('auth:password-change', onPwd);
    return () => {
      window.removeEventListener('auth:revoked', onRevoked);
      window.removeEventListener('auth:password-change', onPwd);
    };
  }, [router, pathname, qc]);
  return null;
}

/** Client-side route guard; the server enforces the same rules on every request. */
export function RequireAuth({ roles, children }: { roles?: Role[]; children: (me: Me) => React.ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  React.useEffect(() => {
    if (me.isLoading || (!me.data && me.isFetching)) return;
    if (!me.data) router.replace(`/login?returnTo=${encodeURIComponent(pathname)}`);
    else if (me.data.user.mustChangePassword) router.replace(`/change-password?returnTo=${encodeURIComponent(pathname)}`);
    else if (roles && !roles.includes(me.data.user.role)) router.replace(homeFor(me.data.user.role));
  }, [me.isLoading, me.isFetching, me.data, roles, router, pathname]);
  if (!me.data || me.data.user.mustChangePassword || (roles && !roles.includes(me.data.user.role))) return null;
  return <>{children(me.data)}</>;
}
