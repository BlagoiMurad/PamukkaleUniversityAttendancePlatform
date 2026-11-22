'use client';
import * as React from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ScrollText, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState, PageHeader, Spinner, Table, TBody, TD, TH, THead, TR } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useFormat } from '@/lib/format';

/** Colour by what the action does, not by which module wrote it. */
function actionTone(action: string): 'default' | 'destructive' | 'warning' | 'success' | 'muted' {
  if (/fail|denied|rejected|revoked|removed|deleted|suspend/.test(action)) return 'destructive';
  if (/approved|created|bound|committed/.test(action)) return 'success';
  if (/changed|updated|corrected|requested/.test(action)) return 'warning';
  return 'muted';
}

export default function AuditPage() {
  const t = useT();
  const fmt = useFormat();
  const [q, setQ] = React.useState('');
  const [debounced, setDebounced] = React.useState('');

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(q), 300);
    return () => window.clearTimeout(id);
  }, [q]);

  const query = useInfiniteQuery({
    queryKey: ['audit', debounced],
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      api(`/admin/audit?take=50${debounced ? `&q=${encodeURIComponent(debounced)}` : ''}${pageParam ? `&cursor=${pageParam}` : ''}`),
    getNextPageParam: (last: any) => last.nextCursor ?? undefined,
  });

  const items = query.data?.pages.flatMap((p: any) => p.items) ?? [];

  return (
    <>
      <PageHeader title={t('nav.audit')} description={t('audit.subtitle')} />
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('audit.search')} />
      </div>

      {query.isLoading ? (
        <Spinner />
      ) : !items.length ? (
        <EmptyState icon={ScrollText} title={t('audit.none')} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>{t('audit.when')}</TH>
                  <TH>{t('audit.actor')}</TH>
                  <TH>{t('audit.action')}</TH>
                  {/* Secondary columns would force side-scrolling on a phone; the row below
                      repeats them under the action instead. */}
                  <TH className="hidden md:table-cell">{t('audit.target')}</TH>
                  <TH className="hidden md:table-cell">{t('common.reason')}</TH>
                </TR>
              </THead>
              <TBody>
                {items.map((e: any) => (
                  <TR key={e.id}>
                    <TD className="text-sm text-muted-foreground md:whitespace-nowrap">{fmt.dateTime(e.createdAt)}</TD>
                    <TD className="max-w-[7rem] truncate text-sm md:max-w-none">{e.actorEmail ?? '—'}</TD>
                    <TD>
                      <Badge variant={actionTone(e.action)} className="whitespace-normal break-all text-left md:break-normal">{e.action}</Badge>
                      <span className="mt-1 block text-xs text-muted-foreground md:hidden">
                        {[e.targetType, e.reason].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </TD>
                    <TD className="hidden text-sm text-muted-foreground md:table-cell">{e.targetType ?? '—'}</TD>
                    <TD className="hidden max-w-xs truncate text-sm md:table-cell">{e.reason ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {query.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
            {t('audit.loadMore')}
          </Button>
        </div>
      )}
    </>
  );
}
