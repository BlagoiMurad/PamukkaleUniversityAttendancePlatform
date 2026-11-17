'use client';
import { Languages, Moon, Sun } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Button } from './ui/button';

export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={() => setLocale(locale === 'en' ? 'bg' : 'en')} aria-label={t('nav.language')}>
        <Languages /> {locale === 'en' ? 'BG' : 'EN'}
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
