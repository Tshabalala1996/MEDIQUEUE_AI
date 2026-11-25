'use client';

import { QueueManager } from '@/components/queue/QueueManager';

export default function NurseQueuePage() {
  return (
    <QueueManager
      title="Queue"
      subtitle="Triage patients and keep their status up to date"
      canTriage
      canRefer
    />
  );
}
