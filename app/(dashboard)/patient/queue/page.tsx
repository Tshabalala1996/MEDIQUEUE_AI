'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { useQueueSockets } from '@/hooks/useSocket';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { statusBadge } from '@/components/ui/Badge';
import { formatWait } from '@/lib/ml/waitTime';
import type { QueueEntry } from '@/types';

export default function PatientQueuePage() {
  const { apiFetch } = useApi();
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/queue?date=${today}`);
    if (res.ok) {
      const d = await res.json();
      setEntries(d.data ?? []);
      setUpdatedAt(new Date());
    }
    setLoading(false);
  }, [apiFetch, today]);

  useEffect(() => {
    load();
    // Safety net in case the live connection drops.
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  // Instant refresh whenever the server reports a change to one of my doctors' queues.
  const live = useQueueSockets(useMemo(() => entries.map((e) => e.doctor_id), [entries]), today, load);

  const seen = new Set<number>();
  const myEntries = entries.filter((e) => {
    if (seen.has(e.appointment_id)) return false;
    seen.add(e.appointment_id);
    return true;
  });

  return (
    <div>
      <Header title="My Queue Status" subtitle="Your place in today's queue — updates the moment it changes" />
      <div className="space-y-6 p-8">
        <div className="flex items-center justify-between text-xs">
          <span className={`flex items-center gap-1.5 font-medium ${live ? 'text-emerald-600' : 'text-gray-400'}`}>
            <span className={`h-2 w-2 rounded-full ${live ? 'animate-pulse bg-emerald-500' : 'bg-gray-300'}`} />
            {live ? 'Live' : 'Refreshing every 30 seconds'}
          </span>
          {updatedAt && <span className="text-gray-400">Updated {updatedAt.toLocaleTimeString('en-ZA')}</span>}
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><span className="animate-spin text-4xl">⏳</span></div>
        ) : myEntries.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-500">
            <p className="text-lg">You have no appointments in today&apos;s queue.</p>
          </div>
        ) : (
          myEntries.map((entry) => (
            <Card key={entry.id}>
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
                {/* Place in line */}
                <div className="flex h-28 w-28 flex-shrink-0 flex-col items-center justify-center rounded-2xl bg-blue-600 text-white">
                  {entry.status === 'Waiting' ? (
                    <>
                      <p className="text-4xl font-extrabold leading-none">{entry.patients_ahead}</p>
                      <p className="mt-1 text-xs font-medium uppercase tracking-wide opacity-80">
                        {entry.patients_ahead === 1 ? 'person ahead' : 'people ahead'}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-medium uppercase tracking-wide opacity-80">Ticket</p>
                      <p className="text-4xl font-extrabold">#{entry.queue_position}</p>
                    </>
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {statusBadge(entry.status)}
                    <span className="text-xs text-gray-400">Ticket #{entry.queue_position}</span>
                    {entry.status === 'In-Progress' && (
                      <span className="animate-pulse text-sm font-medium text-orange-600">
                        🔔 Your turn — please proceed to the consultation room!
                      </span>
                    )}
                  </div>
                  <p className="text-lg font-semibold text-gray-900">{entry.doctor_name}</p>
                  <p className="text-sm text-gray-500">{entry.facility_name}</p>
                  <p className="text-sm text-gray-500">
                    Appointment: {new Date(entry.appointment_datetime).toLocaleString('en-ZA')}
                  </p>

                  {entry.status === 'Waiting' && entry.estimated_wait_minutes !== null && (
                    <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2">
                      <p className="text-sm font-medium text-yellow-800">
                        Estimated wait: {formatWait(Number(entry.estimated_wait_minutes))}
                      </p>
                      <p className="text-xs text-yellow-700/80">
                        AI estimate from the current queue and past consultation times. Urgent cases are seen first, so this can change.
                      </p>
                    </div>
                  )}

                  {entry.status === 'Referred' && (
                    <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-sm text-purple-800">
                      You have been referred to <strong>{entry.referred_to}</strong>.
                      {entry.referral_reason && <span className="block text-xs text-purple-700/80">{entry.referral_reason}</span>}
                    </div>
                  )}

                  {entry.called_at && (
                    <p className="text-xs text-gray-400">
                      Called at: {new Date(entry.called_at).toLocaleTimeString('en-ZA')}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
