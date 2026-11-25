'use client';

import { QueueManager } from '@/components/queue/QueueManager';

export default function AdminQueuesPage() {
  return (
    <QueueManager
      title="Queue Administration"
      subtitle="Monitor and manage every doctor's queue — triage, call, refer and correct statuses"
      canTriage
      canRefer
    />
  );
}
