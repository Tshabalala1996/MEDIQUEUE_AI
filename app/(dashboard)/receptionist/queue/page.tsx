'use client';

import { QueueManager } from '@/components/queue/QueueManager';

export default function ReceptionistQueuePage() {
  return (
    <QueueManager
      title="Queue Management"
      subtitle="Real-time patient queue control"
      canTriage={false}
      canRefer={false}
    />
  );
}
