'use client';
import { WeeklyReport } from '@/components/weekly-report';

/** The same weekly view; for an admin the API aggregates every course. */
export default function AdminReportsPage() {
  return <WeeklyReport />;
}
