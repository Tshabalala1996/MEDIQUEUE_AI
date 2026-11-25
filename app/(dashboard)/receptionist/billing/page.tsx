'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useApi } from '@/hooks/useApi';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface CompletedAppt {
  id: number;
  appointment_datetime: string;
  patient_name: string;
  doctor_name: string;
  facility_name: string;
  patient_id: number;
  status: string;
}

interface Bill {
  id: number;
  appointment_id: number;
  patient_name: string;
  facility_name: string;
  file_fee: number;
  service_fee: number;
  total_amount: number;
  patient_category: string;
  status: string;
  created_at: string;
}

const CATEGORY_FEES: Record<string, { file: number; label: string }> = {
  Indigent: { file: 0,   label: 'Indigent — Free' },
  H1:       { file: 40,  label: 'H1 — Subsidised (R40 file fee)' },
  H2:       { file: 100, label: 'H2 — Co-payment (R100 file fee)' },
  H3:       { file: 195, label: 'H3 — Standard rate (R195 file fee)' },
  Private:  { file: 350, label: 'Private patient (R350 file fee)' },
};

export default function ReceptionistBillingPage() {
  const { apiFetch } = useApi();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [appointments, setAppointments] = useState<CompletedAppt[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);

  // Bill modal
  const [modal, setModal] = useState<CompletedAppt | null>(null);
  const [form, setForm] = useState({ patient_category: 'H1', file_fee: '40', service_fee: '0', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success?: string; error?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Load completed appointments for the day
    const [apptRes, billRes] = await Promise.all([
      apiFetch(`/api/appointments?status=Completed&date=${date}&limit=100`),
      apiFetch(`/api/billing?date=${date}`),
    ]);
    if (apptRes.ok) { const d = await apptRes.json(); setAppointments(d.data ?? []); }
    if (billRes.ok) { const d = await billRes.json(); setBills(d.data ?? []); }
    setLoading(false);
  }, [date, apiFetch]);

  useEffect(() => { load(); }, [load]);

  function openModal(appt: CompletedAppt) {
    setModal(appt);
    setResult(null);
    setForm({ patient_category: 'H1', file_fee: '40', service_fee: '0', notes: '' });
  }

  function onCategoryChange(cat: string) {
    const defaults = CATEGORY_FEES[cat];
    setForm((f) => ({ ...f, patient_category: cat, file_fee: String(defaults?.file ?? 0) }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!modal) return;
    setSubmitting(true);
    setResult(null);

    const res = await apiFetch('/api/billing', {
      method: 'POST',
      body: JSON.stringify({
        appointment_id: modal.id,
        file_fee: Number(form.file_fee),
        service_fee: Number(form.service_fee),
        patient_category: form.patient_category,
        notes: form.notes || undefined,
      }),
    });
    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setResult({ error: data.error ?? 'Failed to process bill' });
    } else {
      const total = Number(data.data?.totalAmount ?? 0);
      setResult({ success: `Bill processed! Total: R${total.toFixed(2)}. Patient notified via SMS and email.` });
      load();
    }
  }

  async function markPaid(billId: number) {
    await apiFetch(`/api/billing/${billId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Paid' }),
    });
    load();
  }

  async function markWaived(billId: number) {
    await apiFetch(`/api/billing/${billId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Waived' }),
    });
    load();
  }

  // Appointments that don't have a bill yet
  const billedIds = new Set(bills.map((b) => b.appointment_id));
  const unbilled = appointments.filter((a) => !billedIds.has(a.id));

  const statusColor: Record<string, string> = {
    Draft: 'text-gray-500', Sent: 'text-blue-600', Paid: 'text-green-600', Waived: 'text-purple-600',
  };

  return (
    <div>
      <Header title="Process Billing" subtitle="Generate bills for completed appointments and notify patients" />
      <div className="p-8 space-y-6">

        <div className="flex items-center gap-4">
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>

        {/* Unbilled completed appointments */}
        <Card title={`Awaiting Billing (${unbilled.length})`}>
          {loading ? (
            <div className="flex justify-center py-8"><span className="animate-spin text-3xl">⏳</span></div>
          ) : unbilled.length === 0 ? (
            <p className="text-center text-gray-500 py-6">All completed appointments have been billed.</p>
          ) : (
            <div className="space-y-3">
              {unbilled.map((appt) => (
                <div key={appt.id}
                  className="flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 p-4">
                  <div>
                    <p className="font-semibold text-gray-900">{appt.patient_name}</p>
                    <p className="text-sm text-gray-600">{appt.doctor_name} · {appt.facility_name}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(appt.appointment_datetime).toLocaleString('en-ZA', { timeStyle: 'short', dateStyle: 'medium' })}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => openModal(appt)}>
                    📄 Process Bill
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Bills already processed today */}
        {bills.length > 0 && (
          <Card title={`Processed Bills (${bills.length})`}>
            <div className="divide-y divide-gray-100">
              {bills.map((bill) => (
                <div key={bill.id} className="flex items-center justify-between py-4">
                  <div className="space-y-0.5">
                    <p className="font-medium text-gray-900">{bill.patient_name}</p>
                    <p className="text-sm text-gray-500">{bill.facility_name} · {bill.patient_category}</p>
                    <p className="text-xs text-gray-400">BILL-{bill.id}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <p className="text-lg font-bold text-gray-900">R{Number(bill.total_amount).toFixed(2)}</p>
                    <span className={`text-xs font-semibold uppercase ${statusColor[bill.status]}`}>{bill.status}</span>
                    {bill.status === 'Sent' && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="success" onClick={() => markPaid(bill.id)}>✓ Paid</Button>
                        <Button size="sm" variant="ghost" onClick={() => markWaived(bill.id)}>Waive</Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Bill Processing Modal */}
      <Modal open={!!modal} onClose={() => { setModal(null); setResult(null); }} title="Process Patient Bill" size="lg">
        {modal && (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Patient summary */}
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 space-y-1 text-sm">
              <p className="font-semibold text-gray-900">{modal.patient_name}</p>
              <p className="text-gray-600">{modal.doctor_name} · {modal.facility_name}</p>
              <p className="text-gray-500">
                {new Date(modal.appointment_datetime).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>

            {/* Patient category (UPFS means test) */}
            <Select
              label="Patient Category (Means Test)"
              value={form.patient_category}
              onChange={(e) => onCategoryChange(e.target.value)}
              options={Object.entries(CATEGORY_FEES).map(([value, { label }]) => ({ value, label }))}
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="File Opening Fee (ZAR)"
                type="number"
                value={form.file_fee}
                onChange={(e) => setForm((f) => ({ ...f, file_fee: e.target.value }))}
                min={0}
                hint="Based on UPFS means test"
              />
              <Input
                label="Additional Services (ZAR)"
                type="number"
                value={form.service_fee}
                onChange={(e) => setForm((f) => ({ ...f, service_fee: e.target.value }))}
                min={0}
                hint="Procedures, medications, tests"
              />
            </div>

            {/* Live total */}
            <div className="rounded-xl bg-blue-50 border border-blue-200 px-5 py-3 flex justify-between items-center">
              <span className="text-blue-700 font-medium">Total Amount Due</span>
              <span className="text-2xl font-extrabold text-blue-900">
                R{(Number(form.file_fee || 0) + Number(form.service_fee || 0)).toFixed(2)}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-gray-700">Notes (optional)</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Additional billing notes..."
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none
                  focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
              />
            </div>

            {result?.error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{result.error}</div>
            )}
            {result?.success && (
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
                ✓ {result.success}
              </div>
            )}

            {!result?.success && (
              <div className="flex gap-3 justify-end">
                <Button type="button" variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
                <Button type="submit" loading={submitting} size="lg">
                  Send Bill via SMS &amp; Email
                </Button>
              </div>
            )}
            {result?.success && (
              <Button variant="ghost" className="w-full" onClick={() => { setModal(null); setResult(null); }}>
                Close
              </Button>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
}
