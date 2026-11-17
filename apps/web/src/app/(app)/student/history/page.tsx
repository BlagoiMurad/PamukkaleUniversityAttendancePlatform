'use client';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/misc';
import { StudentHistoryTable } from '@/components/student-history';
import { useT } from '@/lib/i18n';

export default function HistoryPage() {
  const t = useT();
  return (
    <div>
      <PageHeader title={t('nav.history')} />
      <Card><CardContent className="px-0 pt-2"><StudentHistoryTable /></CardContent></Card>
    </div>
  );
}
