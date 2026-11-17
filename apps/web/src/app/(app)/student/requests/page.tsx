'use client';
import { PageHeader } from '@/components/ui/misc';
import { RequestsInbox } from '@/components/requests-inbox';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return (
    <div>
      <PageHeader title={t('request.myTitle')} description={t('request.studentSubtitle')} />
      <RequestsInbox mode="student" />
    </div>
  );
}
