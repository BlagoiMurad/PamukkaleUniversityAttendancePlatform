'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardList, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState, PageHeader, Spinner } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { useT, type MessageKey } from '@/lib/i18n';
import { useFormat } from '@/lib/format';
import { errorMessage } from '@/lib/errors';

const KIND_LABEL: Record<string, MessageKey> = {
  STUDENT_DISPUTE: 'request.kindDispute',
  MANUAL_CHECKIN: 'request.kindManual',
  TEACHER_CORRECTION: 'request.kindCorrection',
};

const STATUS_TONE: Record<string, 'warning' | 'success' | 'destructive' | 'muted'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'destructive',
  CANCELLED: 'muted',
};

/** What the student themselves asked for, and how it ended. */
export default function StudentRequestsPage() {
  const t = useT();
  const fmt = useFormat();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['my-requests'], queryFn: () => api('/requests') });

  const cancel = useMutation({
    mutationFn: (id: string) => api(`/requests/${id}/cancel`, { method: 'POST', body: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-requests'] });
      toast.success(t('common.saved'));
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  const items: any[] = q.data?.items ?? [];

  return (
    <>
      <PageHeader title={t('nav.requests')} description={t('request.mySubtitle')} />
      {q.isLoading ? (
        <Spinner />
      ) : !items.length ? (
        <EmptyState icon={ClipboardList} title={t('request.myNone')} description={t('request.myNoneHint')} />
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={STATUS_TONE[r.status] ?? 'muted'}>{t(`status.${r.status}` as MessageKey, {}) || r.status}</Badge>
                    <span className="text-sm font-medium">{t(KIND_LABEL[r.kind])}</span>
                    {r.lesson?.course && (
                      <span className="text-sm text-muted-foreground">
                        {r.lesson.course.code} · {fmt.dateTime(r.lesson.startsAt)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{r.reason}</p>
                  {r.reviewNote && <p className="text-sm">{t('request.reviewNote', { note: r.reviewNote })}</p>}
                </div>
                {r.status === 'PENDING' && (
                  <Button size="sm" variant="outline" loading={cancel.isPending} onClick={() => cancel.mutate(r.id)}>
                    <X /> {t('request.cancel')}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
