'use client';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, CalendarRange } from 'lucide-react';
import { PageHeader } from '@/components/ui/misc';
import { Select } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WeeklyReport } from '@/components/weekly-report';
import { CourseReports } from '@/components/teacher/course-reports';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';

export default function AdminReports() {
  const t = useT();
  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api('/courses') });
  const [courseId, setCourseId] = React.useState('');
  React.useEffect(() => { if (!courseId && courses.data?.items?.[0]) setCourseId(courses.data.items[0].id); }, [courses.data, courseId]);
  return (
    <div>
      <PageHeader title={t('report.title')} description={t('report.adminSubtitle')} />
      <Tabs defaultValue="weekly">
        <TabsList>
          <TabsTrigger value="weekly"><CalendarRange /> {t('report.weekly')}</TabsTrigger>
          <TabsTrigger value="course"><BookOpen /> {t('report.byCourse')}</TabsTrigger>
        </TabsList>
        <TabsContent value="weekly"><WeeklyReport admin /></TabsContent>
        <TabsContent value="course" className="space-y-4">
          <Select className="max-w-md" value={courseId} onChange={(e) => setCourseId(e.target.value)} aria-label={t('nav.courses')}>
            {(courses.data?.items ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.code} · {c.title} ({c.term})</option>)}
          </Select>
          {courseId && <CourseReports courseId={courseId} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
