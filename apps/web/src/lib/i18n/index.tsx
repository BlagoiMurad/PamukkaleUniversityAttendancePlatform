'use client';
import * as React from 'react';
import { bg, en, tr, type MessageKey } from './messages';

export type Locale = 'en' | 'bg' | 'tr';
const dictionaries: Record<Locale, Partial<Record<MessageKey, string>>> = { en, bg, tr };

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = React.createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>('en');
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem('locale') as Locale | null;
      if (saved === 'en' || saved === 'bg' || saved === 'tr') setLocaleState(saved);
      else {
        const nav = navigator.language?.toLowerCase() ?? '';
        if (nav.startsWith('bg')) setLocaleState('bg');
        else if (nav.startsWith('tr')) setLocaleState('tr');
      }
    } catch {}
  }, []);
  React.useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const setLocale = React.useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem('locale', l);
    } catch {}
  }, []);
  const t = React.useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => {
      let s = dictionaries[locale][key] ?? en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    },
    [locale],
  );
  const value = React.useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = React.useContext(I18nContext);
  if (!ctx) throw new Error('useI18n outside provider');
  return ctx;
}
export const useT = () => useI18n().t;
export type { MessageKey };
