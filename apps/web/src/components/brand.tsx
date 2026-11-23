'use client';
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * The university crest. Transparent PNG, so it sits on the navy sign-in panel and in dark mode
 * without a white box. `priority` only where it is above the fold (the header), because the
 * crest is the first thing a signed-out visitor sees.
 */
export function Crest({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/pau-logo.png"
      alt="Pamukkale Üniversitesi"
      width={447}
      height={447}
      priority={priority}
      className={cn('object-contain', className)}
    />
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <Link href="/" className={cn('flex items-center gap-2.5 font-bold tracking-tight', className)}>
      <Crest className="size-9 shrink-0" priority />
      {!compact && (
        <span className="leading-tight">
          <span className="block text-[15px]">PAU Attendance</span>
          <span className="block text-[11px] font-medium text-muted-foreground">Pamukkale University</span>
        </span>
      )}
    </Link>
  );
}
