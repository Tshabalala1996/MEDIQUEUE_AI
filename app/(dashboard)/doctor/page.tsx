'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { Header } from '@/components/layout/Header';
import { Card, StatCard } from '@/components/ui/Card';
import { statusBadge } from '@/components/ui/Badge';
import Link from 'next/link';
import type { Appointment, QueueEntry } from '@/types';

export default function DoctorDashboard() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().slice(0, 10);
      const [qRes, aRes] = await Promise.all([
        apiFetch(`/api/queue?date=${today}`),
        apiFetch(`/api/appointments?limit=20`),
      ]);
      if (qRes.ok) { const d = await qRes.json(); setQueue(d.data ?? []); }
      if (aRes.ok) { const d = await aRes.json(); setAppointments(d.data ?? []); }
      setLoading(false);
    }
    load();
  }, [apiFetch]);

  const seen = new Set<number>();
  const uniqueQueue = queue.filter((e) => {
    if (seen.has(e.appointment_id)) return false;
    seen.add(e.appointment_id);
    return true;
  });

  const waiting = uniqueQueue.filter((q) => q.status === 'Waiting').length;
  const inProgress = uniqueQueue.filter((q) => q.status === 'In-Progress');
  const completed = uniqueQueue.filter((q) => q.status === 'Completed').length;

  return (
    <div>
      <Header title={`Dr. ${user?.last_name}'s Dashboard`} subtitle="Today's schedule and queue overview" />
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <StatCard label="Waiting Patients" value={waiting} icon="⏳" color="yellow" />
          <StatCard label="Currently Serving" value={inProgress[0]?.patient_name ?? '—'} icon="👤" color="blue" />
          <StatCard label="Completed Today" value={completed} icon="✅" color="green" />
          <StatCard label="Total Booked" value={appointments.length} icon="📅" color="purple" />
        </div>

        {/* Current patient */}
        {inProgress[0] && (
          <div className="rounded-xl border-2 border-blue-400 bg-blue-50 p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-3">Currently Serving</p>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-2xl font-bold text-white">
                  {inProgress[0].patient_name.charAt(0)}
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">{inProgress[0].patient_name}</p>
                  <p className="text-sm text-gray-500">Queue #{inProgress[0].queue_position}</p>
                  <p className="text-sm text-gray-500">
                    Called: {inProgress[0].called_at ? new Date(inProgress[0].called_at).toLocaleTimeString('en-ZA') : '—'}
                  </p>
                </div>
              </div>
              <Link href="/doctor/appointments">
                <button className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
                  Complete & Next →
                </button>
              </Link>
            </div>
          </div>
        )}

        {/* Queue preview */}
        <Card title="Today's Queue" action={
          <Link href="/doctor/appointments" className="text-sm text-blue-600">Manage →</Link>
        }>
          {loading ? (
            <div className="flex justify-center py-6"><span className="animate-spin text-2xl">⏳</span></div>
          ) : uniqueQueue.length === 0 ? (
            <p className="text-center text-gray-500 py-6">No patients in queue today.</p>
          ) : (
            <div className="space-y-2">
              {uniqueQueue.slice(0, 10).map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 rounded-lg border border-gray-100 p-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-600">
                    #{entry.queue_position}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{entry.patient_name}</p>
                    {entry.estimated_wait_minutes !== null && (
                      <p className="text-xs text-gray-500">~{entry.estimated_wait_minutes} min wait</p>
                    )}
                  </div>
                  {statusBadge(entry.status)}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
