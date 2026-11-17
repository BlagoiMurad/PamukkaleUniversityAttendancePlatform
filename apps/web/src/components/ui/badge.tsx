import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', {
  variants: {
    variant: {
      default: 'bg-primary/10 text-primary ring-primary/20',
      success: 'bg-success/10 text-success ring-success/25',
      warning: 'bg-warning/10 text-warning ring-warning/25',
      destructive: 'bg-destructive/10 text-destructive ring-destructive/25',
      muted: 'bg-muted text-muted-foreground ring-border',
      outline: 'text-foreground ring-border',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
