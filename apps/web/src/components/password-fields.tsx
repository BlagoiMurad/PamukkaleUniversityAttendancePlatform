'use client';
import * as React from 'react';
import { Field, Input } from './ui/input';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function strength(p: string) {
  let s = 0;
  if (p.length >= 10) s++;
  if (p.length >= 14) s++;
  s += [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  return Math.min(4, Math.floor(s / 1.5));
}

export function NewPasswordFields({ value, onChange }: { value: { password: string; repeat: string }; onChange: (v: { password: string; repeat: string }) => void }) {
  const t = useT();
  const s = strength(value.password);
  return (
    <>
      <Field label={t('password.new')} htmlFor="new-password" hint={t('password.rules')}>
        <Input id="new-password" type="password" autoComplete="new-password" value={value.password} onChange={(e) => onChange({ ...value, password: e.target.value })} />
      </Field>
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={cn('h-1.5 flex-1 rounded-full bg-muted transition-colors', i < s && (s <= 1 ? 'bg-destructive' : s === 2 ? 'bg-warning' : 'bg-success'))} />
        ))}
      </div>
      <Field label={t('password.repeat')} htmlFor="repeat-password" error={value.repeat && value.repeat !== value.password ? t('password.mismatch') : undefined}>
        <Input id="repeat-password" type="password" autoComplete="new-password" value={value.repeat} onChange={(e) => onChange({ ...value, repeat: e.target.value })} />
      </Field>
    </>
  );
}
