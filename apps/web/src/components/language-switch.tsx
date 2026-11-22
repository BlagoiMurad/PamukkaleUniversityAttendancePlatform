'use client';
import { Languages, Moon, Sun } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Button } from './ui/button';
import type { Locale } from '@/lib/i18n';

/** Cycles through the languages the university actually uses. */
const LOCALES: Locale[] = ['en', 'bg', 'tr'];

export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setLocale(LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length])}
        aria-label={t('nav.language')}
        title={t('nav.language')}
      >
        <Languages /> {locale.toUpperCase()}
      </Button>
      <ThemeToggle />
    </div>
  );
}

export function ThemeToggle() {
  const toggle = () => {
    const dark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch {}
  };
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme" className="size-8">
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}
