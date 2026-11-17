'use client';
import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { I18nProvider } from '@/lib/i18n';
import { AuthEvents } from '@/lib/auth';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true, staleTime: 10_000 }, mutations: { retry: false } } }),
  );
  React.useEffect(() => {
    try {
      const theme = localStorage.getItem('theme');
      const dark = theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', dark);
    } catch {}
  }, []);
  return (
    <QueryClientProvider client={client}>
      <I18nProvider>
        <AuthEvents />
        {children}
        <Toaster richColors position="top-center" closeButton />
      </I18nProvider>
    </QueryClientProvider>
  );
}
