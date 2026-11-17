'use client';
import { PageHeader } from '@/components/ui/misc';
import { RequestsInbox } from '@/components/requests-inbox';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return (
    <div>
      <PageHeader title={t('request.title')} description={t('request.staffSubtitle')} />
      <RequestsInbox mode="staff" />
    </div>
  );
}
