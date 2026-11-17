'use client';
import * as React from 'react';
import { CheckCircle2, QrCode, ScanLine, ShieldCheck } from 'lucide-react';
import { Logo } from './brand';
import { LanguageSwitch } from './language-switch';
import { useT } from '@/lib/i18n';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[hsl(186_75%_22%)] via-[hsl(184_80%_30%)] to-[hsl(190_70%_42%)] p-10 text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 opacity-[.12]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '22px 22px' }} />
        <div className="relative flex items-center gap-2.5 font-bold">
          <span className="grid size-9 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25">
            <ScanLine className="size-5" />
          </span>
          PAU Attendance
        </div>
        <div className="relative mt-auto max-w-md space-y-6">
          <h2 className="text-4xl font-bold leading-tight tracking-tight">{t('app.tagline')}</h2>
          <ul className="space-y-3 text-white/90">
            <li className="flex gap-3"><QrCode className="mt-0.5 size-5 shrink-0" /> {t('student.how1')}</li>
            <li className="flex gap-3"><ScanLine className="mt-0.5 size-5 shrink-0" /> {t('student.how3')}</li>
            <li className="flex gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0" /> {t('join.cameraWhy')}</li>
          </ul>
        </div>
        <div className="relative mt-10 flex items-center gap-2 text-sm text-white/70"><CheckCircle2 className="size-4" /> Pamukkale Üniversitesi</div>
      </aside>
      <main className="bg-hero flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <div className="lg:invisible"><Logo /></div>
          <LanguageSwitch />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10 animate-fade-in">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
