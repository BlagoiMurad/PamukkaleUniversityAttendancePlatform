'use client';
import * as React from 'react';
import { CoursesList } from '@/components/teacher/courses-list';

export default function Page() {
  return (
    <React.Suspense>
      <CoursesList />
    </React.Suspense>
  );
}
