'use client';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <Link href="/" className={cn('flex items-center gap-2.5 font-bold tracking-tight', className)}>
      <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/25">
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" opacity=".25" />
          <rect x="6" y="6" width="12" height="12" fill="currentColor" />
          <rect x="8" y="8" width="3" height="3" className="fill-primary" />
          <rect x="13" y="8" width="3" height="3" className="fill-primary" />
          <rect x="10.5" y="12.5" width="3" height="3" className="fill-primary" />
        </svg>
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-[15px]">PAU Attendance</span>
          <span className="block text-[11px] font-medium text-muted-foreground">Pamukkale University</span>
        </span>
      )}
    </Link>
  );
}
