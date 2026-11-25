'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { statusBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { EmergencyFollowUp } from '@/components/appointments/EmergencyFollowUp';
import Link from 'next/link';
import type { Appointment } from '@/types';

export default function PatientAppointmentsPage() {
  const { apiFetch } = useApi();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [emergencyFollowupId, setEmergencyFollowupId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '50' });
    if (statusFilter) params.set('status', statusFilter);
    const res = await apiFetch(`/api/appointments?${params}`);
    if (res.ok) { const d = await res.json(); setAppointments(d.data ?? []); }
    setLoading(false);
  }, [statusFilter, apiFetch]);

  useEffect(() => { load(); }, [load]);

  async function handleCancel() {
    if (!cancelId) return;
    setCancelling(true);
    const res = await apiFetch(`/api/appointments/${cancelId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Cancelled' }),
    });
    setCancelling(false);
    setCancelId(null);
    if (res.ok) load();
  }

  return (
    <div>
      <Header title="My Appointments" subtitle="View and manage your appointment history" />
      <div className="p-8 space-y-5">
        <div className="flex items-center justify-between">
          <Select
            label=""
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'Scheduled', label: 'Scheduled' }, { value: 'Confirmed', label: 'Confirmed' },
              { value: 'Completed', label: 'Completed' }, { value: 'Cancelled', label: 'Cancelled' },
              { value: 'No-Show', label: 'No-Show' },
            ]}
            placeholder="All statuses"
            className="w-48"
          />
          <Link href="/patient/book">
            <Button>+ Book New</Button>
          </Link>
        </div>

        <Card>
          {loading ? (
            <div className="flex justify-center py-12"><span className="animate-spin text-3xl">⏳</span></div>
          ) : appointments.length === 0 ? (
            <div className="py-12 text-center text-gray-500">No appointments found.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {appointments.map((apt) => (
                <div key={apt.id} className="flex items-center justify-between py-4">
                  <div className="space-y-0.5">
                    <p className="font-medium text-gray-900">{apt.doctor_name}</p>
                    <p className="text-sm text-gray-500">{apt.facility_name} · {apt.specialization_name}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(apt.appointment_datetime).toLocaleString('en-ZA', {
                        dateStyle: 'medium', timeStyle: 'short',
                      })}
                    </p>
                    {apt.reason_for_visit && <p className="text-xs text-gray-400">Reason: {apt.reason_for_visit}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {statusBadge(apt.status)}
                    <span className="text-sm font-medium text-gray-700">R{Number(apt.consultation_fee).toFixed(2)}</span>
                    {apt.is_emergency && (
                      <Button size="sm" variant="secondary" onClick={() => setEmergencyFollowupId(apt.id)}>
                        Emergency arrival details
                      </Button>
                    )}
                    {['Scheduled', 'Confirmed'].includes(apt.status) && (
                      <Button size="sm" variant="danger" onClick={() => setCancelId(apt.id)}>Cancel</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Modal open={cancelId !== null} onClose={() => setCancelId(null)} title="Cancel Appointment">
        <p className="text-gray-600 mb-6">Are you sure you want to cancel this appointment? This cannot be undone.</p>
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={() => setCancelId(null)}>Keep Appointment</Button>
          <Button variant="danger" loading={cancelling} onClick={handleCancel}>Yes, Cancel</Button>
        </div>
      </Modal>
      {emergencyFollowupId !== null && (
        <EmergencyFollowUp appointmentId={emergencyFollowupId} onClose={() => setEmergencyFollowupId(null)} />
      )}
    </div>
  );
}
