import { Suspense } from 'react';
import { QueueBoardInner } from './QueueBoardInner';

export default function QueueBoardPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-spin">⏳</div>
          <p className="text-xl">Loading queue board...</p>
        </div>
      </div>
    }>
      <QueueBoardInner />
    </Suspense>
  );
}
