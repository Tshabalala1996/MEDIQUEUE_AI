'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { statusBadge } from '@/components/ui/Badge';
import type { Appointment } from '@/types';

const STATUSES = ['Scheduled', 'Confirmed', 'In-Progress', 'Completed', 'Cancelled', 'No-Show', 'Referred'];
const LIMIT = 20;

export default function AdminAppointmentsPage() {
  const { apiFetch } = useApi();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
    if (status) params.set('status', status);
    if (date) params.set('date', date);
    const res = await apiFetch(`/api/appointments?${params}`);
    if (res.ok) {
      const d = await res.json();
      setAppointments(d.data ?? []);
      setTotal(d.pagination?.total ?? 0);
    }
    setLoading(false);
  }, [apiFetch, status, date, offset]);

  useEffect(() => { load(); }, [load]);

  // A changed filter changes the result set, so return to the first page.
  function applyFilters(next: { status?: string; date?: string }) {
    if (next.status !== undefined) setStatus(next.status);
    if (next.date !== undefined) setDate(next.date);
    setOffset(0);
  }

  async function change(a: Appointment, next: string) {
    setBusyId(a.id); setError('');
    try {
      const res = await apiFetch(`/api/appointments/${a.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      if (!res.ok) { const d = await res.json().catch(() => null); setError(d?.error ?? 'Could not update the appointment'); }
    } finally {
      setBusyId(null);
      load();
    }
  }

  async function remove(a: Appointment) {
    if (!window.confirm(`Permanently delete APT-${a.id} for ${a.patient_name}? This cannot be undone.`)) return;
    setBusyId(a.id); setError('');
    try {
      const res = await apiFetch(`/api/appointments/${a.id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json().catch(() => null); setError(d?.error ?? 'Could not delete the appointment'); }
    } finally {
      setBusyId(null);
      load();
    }
  }

  return (
    <div>
      <Header title="Appointments" subtitle="View, confirm, cancel or remove any appointment" />
      <div className="space-y-5 p-8">
        <div className="flex flex-wrap items-end gap-4">
          <Select label="Status" value={status} onChange={(e) => applyFilters({ status: e.target.value })} className="w-44"
            placeholder="All statuses" options={STATUSES.map((s) => ({ value: s, label: s }))} />
          <Input label="Date" type="date" value={date} onChange={(e) => applyFilters({ date: e.target.value })} className="w-44" />
          {(status || date) && (
            <Button variant="ghost" onClick={() => applyFilters({ status: '', date: '' })}>Clear filters</Button>
          )}
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <Card subtitle={`${total} appointment${total === 1 ? '' : 's'}`}>
          {loading ? (
            <div className="flex justify-center py-12"><span className="animate-spin text-3xl">⏳</span></div>
          ) : appointments.length === 0 ? (
            <p className="py-8 text-center text-gray-500">No appointments match these filters.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <th className="pb-3 pr-4">Ref</th>
                      <th className="pb-3 pr-4">Patient</th>
                      <th className="pb-3 pr-4">Doctor</th>
                      <th className="pb-3 pr-4">Facility</th>
                      <th className="pb-3 pr-4">When</th>
                      <th className="pb-3 pr-4">Status</th>
                      <th className="pb-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {appointments.map((a) => {
                      const open = a.status === 'Scheduled' || a.status === 'Confirmed';
                      return (
                        <tr key={a.id} className="hover:bg-gray-50">
                          <td className="py-3 pr-4 font-mono text-xs text-gray-500">APT-{a.id}</td>
                          <td className="py-3 pr-4 font-medium text-gray-900">{a.patient_name}</td>
                          <td className="py-3 pr-4 text-gray-600">{a.doctor_name}</td>
                          <td className="py-3 pr-4 text-gray-600">{a.facility_name}</td>
                          <td className="py-3 pr-4 text-gray-600">
                            {new Date(a.appointment_datetime).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}
                          </td>
                          <td className="py-3 pr-4">{statusBadge(a.status)}</td>
                          <td className="py-3">
                            <div className="flex flex-wrap gap-2">
                              {a.status === 'Scheduled' && (
                                <Button size="sm" variant="success" loading={busyId === a.id} onClick={() => change(a, 'Confirmed')}>Confirm</Button>
                              )}
                              {open && (
                                <Button size="sm" variant="ghost" loading={busyId === a.id} onClick={() => change(a, 'Cancelled')}>Cancel</Button>
                              )}
                              <Button size="sm" variant="danger" loading={busyId === a.id} onClick={() => remove(a)}>Delete</Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
                <span>Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>← Prev</Button>
                  <Button size="sm" variant="ghost" disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}>Next →</Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
