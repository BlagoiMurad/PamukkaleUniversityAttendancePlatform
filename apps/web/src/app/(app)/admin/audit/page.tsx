'use client';
import * as React from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronDown, Filter, KeyRound, LogIn, PenLine, ScrollText, Search, Settings, ShieldAlert, Upload, UserCog, FileSpreadsheet, Radio } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState, PageHeader, Spinner } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useFormat } from '@/lib/format';
import { cn } from '@/lib/utils';

const GROUPS: { prefix: string; icon: any; tone: string }[] = [
  { prefix: 'auth.', icon: LogIn, tone: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  { prefix: 'attendance.', icon: PenLine, tone: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  { prefix: 'lesson.', icon: Radio, tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  { prefix: 'user', icon: UserCog, tone: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  { prefix: 'settings.', icon: Settings, tone: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  { prefix: 'report.', icon: FileSpreadsheet, tone: 'bg-teal-500/10 text-teal-600 dark:text-teal-400' },
  { prefix: 'request.', icon: ShieldAlert, tone: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
  { prefix: 'course.', icon: KeyRound, tone: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
];
const groupOf = (a: string) => GROUPS.find((g) => a.startsWith(g.prefix)) ?? { icon: ScrollText, tone: 'bg-muted text-muted-foreground' };
const ACTIONS = ['', 'auth.login', 'auth.login_failed', 'lesson.started', 'lesson.ended', 'attendance.corrected', 'attendance.removed', 'users.imported', 'user.created', 'settings.updated', 'report.exported', 'request.approved', 'request.rejected', 'auth.refresh_reuse_detected', 'auth.session_revoked', 'course.students_enrolled'];

export default function AuditPage() {
  const t = useT();
  const fmt = useFormat();
  const [q, setQ] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [action, setAction] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [open, setOpen] = React.useState<string | null>(null);
  React.useEffect(() => { const h = setTimeout(() => setDebounced(q), 300); return () => clearTimeout(h); }, [q]);
  const list = useInfiniteQuery({
    queryKey: ['audit', debounced, action, from, to],
    initialPageParam: '',
    queryFn: ({ pageParam }) => api(`/admin/audit?take=50&q=${encodeURIComponent(debounced)}&action=${action}&from=${from}&to=${to ? to + 'T23:59:59' : ''}&cursor=${pageParam}`),
    getNextPageParam: (last: any) => last.nextCursor ?? undefined,
  });
  const items = list.data?.pages.flatMap((p: any) => p.items) ?? [];
  return (
    <div>
      <PageHeader title={t('audit.title')} description={t('audit.subtitle')} />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-[220px] flex-1"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" placeholder={t('audit.search')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <Select className="w-52" value={action} onChange={(e) => setAction(e.target.value)} aria-label={t('audit.action')}>
              {ACTIONS.map((a) => <option key={a} value={a}>{a || t('audit.allActions')}</option>)}
            </Select>
          </div>
          <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
          <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        </div>
        {list.isLoading ? (
          <Spinner />
        ) : !items.length ? (
          <div className="p-5"><EmptyState icon={ScrollText} title={t('audit.empty')} /></div>
        ) : (
          <ol className="divide-y">
            {items.map((e: any) => {
              const g = groupOf(e.action);
              const Icon = g.icon;
              const expanded = open === e.id;
              const meta = e.metadata && Object.keys(e.metadata).length ? e.metadata : null;
              return (
                <li key={e.id}>
                  <button className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/40" onClick={() => setOpen(expanded ? null : e.id)} aria-expanded={expanded}>
                    <span className={cn('mt-0.5 rounded-lg p-2', g.tone)}><Icon className="size-4" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="text-sm font-semibold">{e.action}</code>
                        {e.actorRole && <Badge variant="outline">{e.actorRole.toLowerCase()}</Badge>}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {e.actorEmail ?? t('audit.system')}
                        {e.targetType && <> → {e.targetType}</>}
                        {e.reason && <> · “{e.reason}”</>}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-medium tabular">{fmt.dateTime(e.createdAt)}</p>
                      <p className="text-xs text-muted-foreground">{fmt.relative(e.createdAt)}</p>
                    </div>
                    <ChevronDown className={cn('mt-1 size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
                  </button>
                  {expanded && (
                    <div className="grid gap-2 bg-muted/30 px-4 py-3 pl-16 text-xs sm:grid-cols-2">
                      <Detail k="Target ID" v={e.targetId} />
                      <Detail k="IP" v={e.ipCoarse} />
                      <Detail k="Request ID" v={e.requestId} />
                      <Detail k="Actor ID" v={e.actorId} />
                      {meta && <pre className="col-span-full overflow-x-auto rounded-lg border bg-card p-3 font-mono">{JSON.stringify(meta, null, 2)}</pre>}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {list.hasNextPage && (
          <div className="border-t p-3 text-center"><Button variant="outline" loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>{t('audit.loadMore')}</Button></div>
        )}
      </Card>
    </div>
  );
}

function Detail({ k, v }: { k: string; v?: string | null }) {
  return <div><span className="text-muted-foreground">{k}: </span><code className="break-all">{v ?? '—'}</code></div>;
}
