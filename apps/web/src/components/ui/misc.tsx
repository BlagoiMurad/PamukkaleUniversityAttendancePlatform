import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyArt } from '../illustrations';

export const Skeleton = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('animate-pulse rounded-md bg-muted', className)} {...p} />;

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 p-8 text-muted-foreground', className)} role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="text-sm">{label ?? 'Loading…'}</span>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon?: React.ComponentType<{ className?: string }>; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center sm:p-10">
      <EmptyArt className="h-24 w-36" />
      {Icon && (
        <div className="-mt-2 rounded-full bg-accent p-3 text-accent-foreground">
          <Icon className="size-6" />
        </div>
      )}
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {description && <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Alert({ variant = 'info', title, children, icon: Icon, className }: { variant?: 'info' | 'success' | 'warning' | 'destructive'; title?: string; children?: React.ReactNode; icon?: React.ComponentType<{ className?: string }>; className?: string }) {
  const styles = {
    info: 'border-primary/25 bg-primary/5 text-foreground',
    success: 'border-success/30 bg-success/10',
    warning: 'border-warning/30 bg-warning/10',
    destructive: 'border-destructive/30 bg-destructive/10',
  }[variant];
  const iconColor = { info: 'text-primary', success: 'text-success', warning: 'text-warning', destructive: 'text-destructive' }[variant];
  return (
    <div className={cn('flex gap-3 rounded-xl border p-4 text-sm', styles, className)} role={variant === 'destructive' ? 'alert' : 'status'}>
      {Icon && <Icon className={cn('mt-0.5 size-5 shrink-0', iconColor)} />}
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-muted-foreground [&_strong]:text-foreground">{children}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, hint, icon: Icon, tone = 'default' }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ComponentType<{ className?: string }>; tone?: 'default' | 'success' | 'warning' | 'destructive' }) {
  const toneCls = { default: 'bg-primary/10 text-primary', success: 'bg-success/10 text-success', warning: 'bg-warning/10 text-warning', destructive: 'bg-destructive/10 text-destructive' }[tone];
  return (
    <div className="elevate elevate-hover sheen overflow-hidden rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn('rounded-lg p-1.5', toneCls)}>
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <p className="mt-1 text-3xl font-bold tracking-tight tabular">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        {eyebrow && <div className="text-sm font-medium text-primary">{eyebrow}</div>}
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Table({ className, ...p }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full caption-bottom text-sm', className)} {...p} />
    </div>
  );
}
export const THead = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <thead className="[&_tr]:border-b" {...p} />;
export const TBody = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody className="[&_tr:last-child]:border-0" {...p} />;
export const TR = ({ className, ...p }: React.HTMLAttributes<HTMLTableRowElement>) => <tr className={cn('border-b transition-colors hover:bg-muted/40', className)} {...p} />;
export const TH = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => <th className={cn('h-10 px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground', className)} {...p} />;
export const TD = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn('px-3 py-2.5 align-middle', className)} {...p} />;
