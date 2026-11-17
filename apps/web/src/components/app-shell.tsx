'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  ClipboardList,
  FileSpreadsheet,
  History,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  ShieldCheck,
  Upload,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { Logo } from './brand';
import { LanguageSwitch } from './language-switch';
import { Button } from './ui/button';
import { useT, type MessageKey } from '@/lib/i18n';
import { useLogout, type Me } from '@/lib/auth';
import { cn, initials } from '@/lib/utils';

type NavItem = { href: string; label: MessageKey; icon: React.ComponentType<{ className?: string }>; exact?: boolean };

const NAV: Record<Me['user']['role'], NavItem[]> = {
  ADMIN: [
    { href: '/admin', label: 'nav.dashboard', icon: LayoutDashboard, exact: true },
    { href: '/admin/users', label: 'nav.users', icon: Users },
    { href: '/admin/import', label: 'nav.import', icon: Upload },
    { href: '/admin/courses', label: 'nav.courses', icon: BookOpen },
    { href: '/admin/reports', label: 'nav.reports', icon: FileSpreadsheet },
    { href: '/admin/requests', label: 'nav.requests', icon: Inbox },
    { href: '/admin/audit', label: 'nav.audit', icon: ScrollText },
    { href: '/admin/settings', label: 'nav.settings', icon: Settings },
  ],
  TEACHER: [
    { href: '/teacher', label: 'nav.dashboard', icon: LayoutDashboard, exact: true },
    { href: '/teacher/courses', label: 'nav.myCourses', icon: BookOpen },
    { href: '/teacher/reports', label: 'nav.reports', icon: FileSpreadsheet },
    { href: '/teacher/requests', label: 'nav.requests', icon: Inbox },
  ],
  STUDENT: [
    { href: '/student', label: 'nav.dashboard', icon: LayoutDashboard, exact: true },
    { href: '/student/history', label: 'nav.history', icon: History },
    { href: '/student/requests', label: 'nav.requests', icon: ClipboardList },
  ],
};

function useOnline() {
  const [online, setOnline] = React.useState(true);
  React.useEffect(() => {
    const up = () => setOnline(navigator.onLine);
    up();
    window.addEventListener('online', up);
    window.addEventListener('offline', up);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', up);
    };
  }, []);
  return online;
}

export function AppShell({ me, children }: { me: Me; children: React.ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const logout = useLogout();
  const online = useOnline();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => setOpen(false), [pathname]);
  const items: NavItem[] = [...NAV[me.user.role], { href: '/profile', label: 'nav.profile', icon: ShieldCheck }];

  const nav = (
    <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
              active && 'bg-accent text-accent-foreground hover:bg-accent',
            )}
          >
            <item.icon className="size-[18px]" />
            {t(item.label)}
          </Link>
        );
      })}
    </nav>
  );

  const userCard = (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary">{initials(me.user.name)}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{me.user.preferredName || me.user.name}</p>
        <p className="truncate text-xs text-muted-foreground">{t(`role.${me.user.role}` as MessageKey)}</p>
      </div>
      <Button variant="ghost" size="icon" className="size-8" onClick={logout} aria-label={t('nav.signOut')} title={t('nav.signOut')}>
        <LogOut />
      </Button>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r bg-card/60 p-4 backdrop-blur lg:flex">
        <Logo className="px-2 pt-1" />
        {nav}
        {userCard}
      </aside>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-background/85 px-4 py-2.5 backdrop-blur lg:hidden">
        <Logo />
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Menu">
          <Menu />
        </Button>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal>
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-72 flex-col gap-6 bg-card p-4 shadow-xl animate-fade-in">
            <div className="flex items-center justify-between">
              <Logo compact />
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label={t('common.close')}><X /></Button>
            </div>
            {nav}
            <LanguageSwitch />
            {userCard}
          </div>
        </div>
      )}
      <div className="min-w-0">
        <div className="hidden justify-end px-8 pt-4 lg:flex"><LanguageSwitch /></div>
        {!online && (
          <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg bg-warning/15 px-3 py-2 text-sm font-medium text-warning lg:mx-8">
            <WifiOff className="size-4" /> {t('common.offline')}
          </div>
        )}
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-4">{children}</main>
      </div>
    </div>
  );
}
