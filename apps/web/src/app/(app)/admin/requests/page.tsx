'use client';
import { RequestsInbox } from '@/components/requests-inbox';

/** Same queue as the teacher's; the API already scopes an admin to everything. */
export default function AdminRequestsPage() {
  return <RequestsInbox />;
}
