'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Inbox, Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, EmptyState, PageHeader, Spinner } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';

const KIND_LABEL: Record<string, string> = {
  STUDENT_DISPUTE: 'request.kindDispute',
  MANUAL_CHECKIN: 'request.kindManual',
  TEACHER_CORRECTION: 'request.kindCorrection',
};

export function RequestsInbox() {
  const t = useT();
  return (
    <>
      <PageHeader title={t('nav.requests')} description={t('request.subtitle')} />
      <Tabs defaultValue="attendance">
        <TabsList>
          <TabsTrigger value="attendance">{t('request.tabAttendance')}</TabsTrigger>
          <TabsTrigger value="devices">{t('device.requests')}</TabsTrigger>
        </TabsList>
        <TabsContent value="attendance">
          <AttendanceRequests />
        </TabsContent>
        <TabsContent value="devices">
          <DeviceRequests />
        </TabsContent>
      </Tabs>
    </>
  );
}

function useReview(path: string, queryKey: string) {
  const t = useT();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) => api(`/${path}/${id}/${action}`, { method: 'POST', body: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] });
      toast.success(t('common.saved'));
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
}

function AttendanceRequests() {
  const t = useT();
  const q = useQuery({ queryKey: ['requests'], queryFn: () => api('/requests?status=PENDING') });
  const review = useReview('requests', 'requests');
  const items: any[] = q.data?.items ?? [];

  if (q.isLoading) return <Spinner />;
  if (!items.length) return <EmptyState icon={Inbox} title={t('request.none')} description={t('request.noneHint')} />;

  return (
    <div className="space-y-3">
      {items.map((r) => (
        <Card key={r.id}>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.student.name}</span>
                <Badge variant="muted">{t(KIND_LABEL[r.kind] as any)}</Badge>
                {r.lesson?.course && (
                  <span className="text-sm text-muted-foreground">
                    {r.lesson.course.code} · {new Date(r.lesson.startsAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{r.reason}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="outline" loading={review.isPending} onClick={() => review.mutate({ id: r.id, action: 'reject' })}>
                <X /> {t('device.reject')}
              </Button>
              <Button size="sm" loading={review.isPending} onClick={() => review.mutate({ id: r.id, action: 'approve' })}>
                <Check /> {t('device.approve')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DeviceRequests() {
  const t = useT();
  const q = useQuery({ queryKey: ['device-requests'], queryFn: () => api('/device-requests?status=PENDING') });
  const review = useReview('device-requests', 'device-requests');
  const items: any[] = q.data?.items ?? [];

  if (q.isLoading) return <Spinner />;
  if (!items.length) return <EmptyState icon={Smartphone} title={t('device.noRequests')} />;

  return (
    <div className="space-y-3">
      <Alert variant="warning">{t('device.reviewWarning')}</Alert>
      {items.map((r) => (
        <Card key={r.id}>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.user.name}</span>
                {r.user.studentProfile?.facultyNumber && <span className="tabular text-sm text-muted-foreground">{r.user.studentProfile.facultyNumber}</span>}
              </div>
              <p className="text-sm">{r.reason}</p>
              <p className="text-xs text-muted-foreground">
                {t('device.currentDevice')}: {r.previousLabel || '—'} → {t('device.newDevice')}: {r.newLabel || '—'}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="outline" loading={review.isPending} onClick={() => review.mutate({ id: r.id, action: 'reject' })}>
                <X /> {t('device.reject')}
              </Button>
              <Button size="sm" loading={review.isPending} onClick={() => review.mutate({ id: r.id, action: 'approve' })}>
                <Check /> {t('device.approve')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
