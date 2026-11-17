'use client';
import { PageHeader } from '@/components/ui/misc';
import { WeeklyReport } from '@/components/weekly-report';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return (
    <div>
      <PageHeader title={t('report.title')} description={t('report.subtitle')} />
      <WeeklyReport />
    </div>
  );
}
