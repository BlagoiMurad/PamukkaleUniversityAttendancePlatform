'use client';
import * as React from 'react';
import { CheckCircle2, QrCode, ScanLine, ShieldCheck } from 'lucide-react';
import { Crest, Logo } from './brand';
import { SignInArt, TerraceBackdrop } from './illustrations';
import { LanguageSwitch } from './language-switch';
import { useT } from '@/lib/i18n';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[hsl(215_65%_24%)] via-[hsl(214_60%_32%)] to-[hsl(210_56%_45%)] p-10 text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 opacity-[.12]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '22px 22px' }} />
        <div className="relative flex items-center gap-2.5 font-bold">
          <span className="grid size-11 place-items-center rounded-xl bg-white/95 p-1 shadow-sm ring-1 ring-white/40">
            <Crest className="size-full" />
          </span>
          PAU Attendance
        </div>
        <TerraceBackdrop className="pointer-events-none absolute inset-x-0 bottom-0 h-64 w-full opacity-60" />
        <SignInArt className="relative mx-auto mt-10 w-full max-w-xs" />
        <div className="relative mt-auto max-w-md space-y-6">
          <h2 className="text-balance text-4xl font-bold leading-tight tracking-tight">{t('app.tagline')}</h2>
          <ul className="space-y-3 text-white/90">
            <li className="flex gap-3"><QrCode className="mt-0.5 size-5 shrink-0" /> {t('student.how1')}</li>
            <li className="flex gap-3"><ScanLine className="mt-0.5 size-5 shrink-0" /> {t('student.how3')}</li>
            <li className="flex gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0" /> {t('join.cameraWhy')}</li>
          </ul>
        </div>
        <div className="relative mt-10 flex items-center gap-2 text-sm text-white/70"><CheckCircle2 className="size-4" /> Pamukkale Üniversitesi</div>
      </aside>
      <main className="bg-hero relative flex flex-col px-5 py-6 sm:px-10">
        <TerraceBackdrop className="pointer-events-none absolute inset-x-0 bottom-0 h-44 w-full lg:hidden" />
        <div className="flex items-center justify-between">
          <div className="lg:invisible"><Logo /></div>
          <LanguageSwitch />
        </div>
        <div className="relative mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-8 animate-fade-in">
          {/* On a phone the left panel is gone, so the artwork comes here instead. */}
          <SignInArt className="mx-auto mb-6 w-48 lg:hidden" />
          <h1 className="text-balance text-3xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
