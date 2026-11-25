'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { useQueueSockets } from '@/hooks/useSocket';
import { Header } from '@/components/layout/Header';
import { Card, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TriageBadge, AiFlagPill } from '@/components/queue/TriageBadge';
import { TriageModal } from '@/components/queue/TriageModal';
import type { QueueEntry } from '@/types';

export default function NurseDashboard() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [triageEntry, setTriageEntry] = useState<QueueEntry | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/queue?date=${today}`);
    if (res.ok) { const d = await res.json(); setQueue(d.data ?? []); }
    setLoading(false);
  }, [apiFetch, today]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const id = setInterval(load, 30_000); return () => clearInterval(id); }, [load]);
  useQueueSockets(useMemo(() => queue.map((q) => q.doctor_id), [queue]), today, load);

  const waiting = queue.filter((q) => q.status === 'Waiting');
  const untriaged = waiting.filter((q) => !q.triage_category);
  // AI-flagged entries already carry a category (set by the emergency fast-track), so they
  // would not show up in "untriaged" — but they still need a clinician to confirm them.
  const aiFlagged = queue.filter((q) => q.ai_flagged && (q.status === 'Waiting' || q.status === 'In-Progress'));
  const urgent = waiting.filter((q) => q.triage_category === 'Red' || q.triage_category === 'Orange');
  const serving = queue.filter((q) => q.status === 'In-Progress').length;
  const done = queue.filter((q) => q.status === 'Completed').length;

  return (
    <div>
      <Header title={`Welcome, ${user?.first_name ?? 'Nurse'}`} subtitle="Triage station — today's patients" />
      <div className="space-y-6 p-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <StatCard label="Awaiting triage" value={untriaged.length} icon="🩺" color="yellow" />
          <StatCard label="AI-flagged, unconfirmed" value={aiFlagged.length} icon="⚠" color="red" />
          <StatCard label="Being attended" value={serving} icon="♥" color="blue" />
          <StatCard label="Completed today" value={done} icon="✓" color="green" />
        </div>

        {aiFlagged.length > 0 && (
          <Card
            title="⚠ AI-flagged emergencies — confirm now"
            subtitle="The emergency symptom pre-check fast-tracked these patients. Please confirm or override the priority as soon as possible."
          >
            <div className="space-y-3">
              {aiFlagged.map((entry) => (
                <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-gray-900">
                      {entry.patient_name} <TriageBadge category={entry.triage_category} /> <AiFlagPill />
                    </p>
                    <p className="text-xs text-gray-500">
                      {entry.doctor_name} · #{entry.queue_position} · {entry.status}
                    </p>
                  </div>
                  <Button size="sm" variant="danger" onClick={() => setTriageEntry(entry)}>🩺 Confirm now</Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card
          title="Patients awaiting triage"
          subtitle="Assess vital signs and confirm a priority — the queue re-orders automatically"
          action={<Link href="/nurse/queue" className="text-sm font-medium text-[#2346E8]">Full queue →</Link>}
        >
          {loading ? (
            <div className="flex justify-center py-8"><span className="animate-spin text-3xl">⏳</span></div>
          ) : untriaged.length === 0 ? (
            <p className="py-6 text-center text-gray-500">Everyone waiting has been triaged. 🎉</p>
          ) : (
            <div className="space-y-3">
              {untriaged.map((entry) => (
                <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-4">
                  <div>
                    <p className="font-medium text-gray-900">{entry.patient_name}</p>
                    <p className="text-xs text-gray-500">
                      {entry.doctor_name} · #{entry.queue_position} · {new Date(entry.appointment_datetime).toLocaleTimeString('en-ZA', { timeStyle: 'short' })}
                    </p>
                  </div>
                  <Button size="sm" variant="blue" onClick={() => setTriageEntry(entry)}>🩺 Triage</Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {urgent.length > 0 && (
          <Card title="Urgent patients waiting">
            <div className="space-y-2">
              {urgent.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-3 text-sm">
                  <span className="font-medium text-gray-900">{entry.patient_name} <span className="text-gray-400">· {entry.doctor_name}</span></span>
                  <TriageBadge category={entry.triage_category} />
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {triageEntry && (
        <TriageModal key={triageEntry.id} open entry={triageEntry} onClose={() => setTriageEntry(null)} onSaved={load} />
      )}
    </div>
  );
}
