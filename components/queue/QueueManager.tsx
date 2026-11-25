'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { useQueueSockets } from '@/hooks/useSocket';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { statusBadge } from '@/components/ui/Badge';
import { TriageBadge, AiFlagPill } from './TriageBadge';
import { TriageModal } from './TriageModal';
import { ReferModal } from './ReferModal';
import type { QueueEntry } from '@/types';

type QueueAction = 'call' | 'complete' | 'no-show' | 'skip' | 'waiting' | 'refer';

interface Props {
  title: string;
  subtitle: string;
  /** Nurses and admins can triage; receptionists cannot. */
  canTriage: boolean;
  /** Referring a patient is a clinical decision. */
  canRefer: boolean;
}

interface DoctorOption { doctor_id: number; full_name: string }

const isoToday = () => new Date().toISOString().slice(0, 10);

/**
 * Live queue control shared by receptionists, nurses and admins (FR02, FR04, FR09):
 * every status change (waiting → being attended → completed / no-show / referred) is one click,
 * and the list is kept current over WebSockets with a 30-second poll as a safety net.
 */
export function QueueManager({ title, subtitle, canTriage, canRefer }: Props) {
  const { apiFetch } = useApi();
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState(isoToday());
  const [triageEntry, setTriageEntry] = useState<QueueEntry | null>(null);
  const [referEntry, setReferEntry] = useState<QueueEntry | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ date });
    if (doctorId) params.set('doctor_id', doctorId);
    const res = await apiFetch(`/api/queue?${params}`);
    if (res.ok) { const d = await res.json(); setQueue(d.data ?? []); }
    setLoading(false);
  }, [date, doctorId, apiFetch]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const id = setInterval(load, 30_000); return () => clearInterval(id); }, [load]);

  useEffect(() => {
    apiFetch('/api/doctors?limit=100').then(async (r) => {
      if (r.ok) { const d = await r.json(); setDoctors(d.data ?? []); }
    }).catch(() => {});
  }, [apiFetch]);

  const live = useQueueSockets(useMemo(() => queue.map((q) => q.doctor_id), [queue]), date, load);

  async function act(entry: QueueEntry, action: QueueAction, extra?: { referred_to: string; referral_reason: string }) {
    setBusyId(entry.id);
    setError('');
    try {
      const res = await apiFetch(`/api/queue/${entry.id}`, { method: 'PATCH', body: JSON.stringify({ action, ...extra }) });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? 'That action could not be completed');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusyId(null);
      setReferEntry(null);
      load();
    }
  }

  const inProgress = queue.filter((q) => q.status === 'In-Progress');
  const busyDoctors = new Set(inProgress.map((q) => q.doctor_id));
  const waiting = queue.filter((q) => q.status === 'Waiting'); // server order: priority, then arrival
  const closed = queue.filter((q) => ['Completed', 'No-Show', 'Skipped', 'Referred'].includes(q.status));
  const untriaged = waiting.filter((q) => !q.triage_category).length;
  const aiFlagged = queue.filter((q) => q.ai_flagged && (q.status === 'Waiting' || q.status === 'In-Progress')).length;

  return (
    <div>
      <Header title={title} subtitle={subtitle} />
      <div className="space-y-6 p-8">
        <div className="flex flex-wrap items-end gap-4">
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          <Select
            label="Doctor" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="w-64"
            placeholder="All doctors"
            options={doctors.map((d) => ({ value: d.doctor_id, label: d.full_name }))}
          />
          <span className={`mb-2.5 flex items-center gap-1.5 text-xs font-medium ${live ? 'text-emerald-600' : 'text-gray-400'}`}>
            <span className={`h-2 w-2 rounded-full ${live ? 'animate-pulse bg-emerald-500' : 'bg-gray-300'}`} />
            {live ? 'Live' : 'Refreshing every 30s'}
          </span>
          {canTriage && untriaged > 0 && (
            <span className="mb-2.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              {untriaged} awaiting triage
            </span>
          )}
          {aiFlagged > 0 && (
            <span className="mb-2.5 animate-pulse rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800">
              ⚠ {aiFlagged} AI-flagged emergenc{aiFlagged === 1 ? 'y' : 'ies'} — confirm now
            </span>
          )}
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {/* Being attended */}
        {inProgress.map((entry) => (
          <div key={entry.id} className="rounded-xl border-2 border-orange-400 bg-orange-50 p-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-orange-600">Being attended to</p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-xl font-bold text-gray-900">
                  {entry.patient_name} <TriageBadge category={entry.triage_category} compact /> {entry.ai_flagged && <AiFlagPill />}
                </p>
                <p className="text-sm text-gray-600">{entry.doctor_name} · {entry.facility_name}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="success" loading={busyId === entry.id} onClick={() => act(entry, 'complete')}>✅ Complete</Button>
                {canRefer && <Button size="sm" variant="secondary" onClick={() => setReferEntry(entry)}>↗ Refer</Button>}
                <Button size="sm" variant="ghost" loading={busyId === entry.id} onClick={() => act(entry, 'waiting')}>Back to waiting</Button>
                <Button size="sm" variant="danger" loading={busyId === entry.id} onClick={() => act(entry, 'no-show')}>No-Show</Button>
              </div>
            </div>
          </div>
        ))}

        {/* Waiting */}
        <Card title={`Waiting queue (${waiting.length})`} subtitle="Most urgent first, then order of arrival">
          {loading ? (
            <div className="flex justify-center py-8"><span className="animate-spin text-3xl">⏳</span></div>
          ) : waiting.length === 0 ? (
            <p className="py-6 text-center text-gray-500">Queue is empty.</p>
          ) : (
            <div className="space-y-3">
              {waiting.map((entry) => (
                <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                      #{entry.queue_position}
                    </div>
                    <div>
                      <p className="flex flex-wrap items-center gap-2 font-medium text-gray-900">
                        {entry.patient_name} <TriageBadge category={entry.triage_category} /> {entry.ai_flagged && <AiFlagPill />}
                      </p>
                      <p className="text-xs text-gray-500">
                        {entry.doctor_name} · {new Date(entry.appointment_datetime).toLocaleTimeString('en-ZA', { timeStyle: 'short' })}
                        {' · '}{entry.patients_ahead} ahead
                        {entry.estimated_wait_minutes !== null && ` · ~${entry.estimated_wait_minutes} min wait`}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canTriage && (
                      <Button size="sm" variant={entry.triage_category ? 'ghost' : 'blue'} onClick={() => setTriageEntry(entry)}>
                        {entry.triage_category ? 'Re-triage' : '🩺 Triage'}
                      </Button>
                    )}
                    {!busyDoctors.has(entry.doctor_id) && (
                      <Button size="sm" loading={busyId === entry.id} onClick={() => act(entry, 'call')}>📢 Call</Button>
                    )}
                    <Button size="sm" variant="ghost" loading={busyId === entry.id} onClick={() => act(entry, 'skip')}>Skip</Button>
                    {canRefer && <Button size="sm" variant="secondary" onClick={() => setReferEntry(entry)}>↗ Refer</Button>}
                    <Button size="sm" variant="danger" loading={busyId === entry.id} onClick={() => act(entry, 'no-show')}>No-Show</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Closed */}
        {closed.length > 0 && (
          <Card title={`Closed (${closed.length})`}>
            <div className="space-y-2">
              {closed.map((entry) => (
                <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-50 py-2 text-sm last:border-0">
                  <span className="text-gray-700">
                    {entry.patient_name} · {entry.doctor_name}
                    {entry.status === 'Referred' && entry.referred_to && (
                      <span className="ml-2 text-xs text-purple-700">→ {entry.referred_to}</span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    {entry.status === 'No-Show' && (
                      <Button size="sm" variant="ghost" loading={busyId === entry.id} onClick={() => act(entry, 'waiting')}>Back to waiting</Button>
                    )}
                    {statusBadge(entry.status)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {triageEntry && (
        <TriageModal key={triageEntry.id} open entry={triageEntry} onClose={() => setTriageEntry(null)} onSaved={load} />
      )}
      {referEntry && (
        <ReferModal
          key={referEntry.id} open entry={referEntry} loading={busyId === referEntry.id}
          onClose={() => setReferEntry(null)}
          onConfirm={(referred_to, referral_reason) => act(referEntry, 'refer', { referred_to, referral_reason })}
        />
      )}
    </div>
  );
}
