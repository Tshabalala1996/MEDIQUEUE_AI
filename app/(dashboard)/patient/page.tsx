'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { Header } from '@/components/layout/Header';
import { Card, StatCard } from '@/components/ui/Card';
import { statusBadge } from '@/components/ui/Badge';
import Link from 'next/link';
import type { Appointment, QueueEntry } from '@/types';

export default function PatientDashboard() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().slice(0, 10);
      const [aptRes, queueRes] = await Promise.all([
        apiFetch(`/api/appointments?limit=5`),
        apiFetch(`/api/queue?date=${today}`),
      ]);
      if (aptRes.ok) { const d = await aptRes.json(); setAppointments(d.data ?? []); }
      if (queueRes.ok) { const d = await queueRes.json(); setQueueEntries(d.data ?? []); }
      setLoading(false);
    }
    load();
  }, [apiFetch]);

  const upcoming = appointments.filter((a) => new Date(a.appointment_datetime) >= new Date() && a.status === 'Scheduled');
  const todayQueue = queueEntries.filter((q) => q.status === 'Waiting');

  return (
    <div>
      <Header title={`Welcome, ${user?.first_name ?? 'Patient'}!`} subtitle="Manage your healthcare appointments" />
      <div className="p-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Upcoming Appointments" value={upcoming.length} icon="📅" color="blue" />
          <StatCard label="Queue Position Today" value={todayQueue[0]?.queue_position ?? '—'} icon="⏳" color="yellow" sub={todayQueue[0] ? `Wait: ~${todayQueue[0].estimated_wait_minutes ?? '?'} min` : undefined} />
          <StatCard label="Total Appointments" value={appointments.length} icon="📋" color="green" />
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { href: '/patient/book', icon: '📅', label: 'Book Appointment' },
            { href: '/patient/symptoms', icon: '🩺', label: 'Symptom Checker' },
            { href: '/patient/queue', icon: '⏳', label: 'My Queue Status' },
            { href: '/patient/medical-history', icon: '📂', label: 'Medical History' },
          ].map((action) => (
            <Link key={action.href} href={action.href}
              className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm hover:border-blue-300 hover:shadow-md transition-all">
              <span className="text-3xl">{action.icon}</span>
              <span className="text-sm font-medium text-gray-700">{action.label}</span>
            </Link>
          ))}
        </div>

        {/* Recent appointments */}
        <Card title="Recent Appointments" action={
          <Link href="/patient/appointments" className="text-sm text-blue-600 hover:text-blue-700">View all →</Link>
        }>
          {loading ? (
            <div className="flex justify-center py-8"><span className="animate-spin text-2xl">⏳</span></div>
          ) : appointments.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              <p>No appointments yet.</p>
              <Link href="/patient/book" className="mt-2 inline-block text-sm text-blue-600 hover:underline">Book your first appointment →</Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {appointments.slice(0, 5).map((apt) => (
                <div key={apt.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{apt.doctor_name}</p>
                    <p className="text-xs text-gray-500">{apt.facility_name} · {apt.specialization_name}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(apt.appointment_datetime).toLocaleString('en-ZA')}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {statusBadge(apt.status)}
                    <span className="text-xs text-gray-500">R{Number(apt.consultation_fee).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
