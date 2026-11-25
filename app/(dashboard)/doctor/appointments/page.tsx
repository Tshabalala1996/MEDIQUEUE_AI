'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { useQueueSockets } from '@/hooks/useSocket';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { statusBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { TriageBadge, AiFlagPill } from '@/components/queue/TriageBadge';
import { TriageModal } from '@/components/queue/TriageModal';
import { ReferModal } from '@/components/queue/ReferModal';
import type { QueueEntry } from '@/types';

export default function DoctorAppointmentsPage() {
  const { apiFetch } = useApi();
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [diagnosisModal, setDiagnosisModal] = useState<{
    open: boolean;
    appointmentId: number;
    patientId: number;
    consultationFee: number;
    careType: 'Public' | 'Private';
  } | null>(null);
  const [diagnosisForm, setDiagnosisForm] = useState({
    diagnosis: '',
    prescription: '',
    notes: '',
    patient_category: 'H1' as 'Indigent' | 'H1' | 'H2' | 'H3' | 'Private',
    file_fee: 0,
    service_fee: 0,
    generate_bill: true,
  });
  const [saving, setSaving] = useState(false);
  const [billResult, setBillResult] = useState<{ billId: number; total: number } | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));

  const [triageEntry, setTriageEntry] = useState<QueueEntry | null>(null);
  const [referEntry, setReferEntry] = useState<QueueEntry | null>(null);

  // Only the first load / a date change shows the spinner; live refreshes update quietly.
  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    const res = await apiFetch(`/api/queue?date=${selectedDate}`);
    if (res.ok) { const d = await res.json(); setQueue(d.data ?? []); }
    setLoading(false);
  }, [apiFetch, selectedDate]);

  useEffect(() => { load(true); }, [load]);
  useQueueSockets(useMemo(() => queue.map((q) => q.doctor_id), [queue]), selectedDate, load);

  async function queueAction(
    queueId: number,
    action: 'call' | 'complete' | 'no-show' | 'skip' | 'refer',
    extra?: { referred_to: string; referral_reason: string }
  ) {
    setActionLoading(queueId);
    await apiFetch(`/api/queue/${queueId}`, { method: 'PATCH', body: JSON.stringify({ action, ...extra }) });
    setActionLoading(null);
    setReferEntry(null);
    load();
  }

  function openDiagnosisModal(entry: { appointmentId: number; patientId: number; consultationFee: number; careType: 'Public' | 'Private' }) {
    const isPrivate = entry.careType === 'Private';
    setDiagnosisModal({ open: true, ...entry });
    setBillResult(null);
    setDiagnosisForm({
      diagnosis: '',
      prescription: '',
      notes: '',
      patient_category: isPrivate ? 'Private' : 'H1',
      file_fee: 0,
      service_fee: isPrivate ? entry.consultationFee : 0,
      generate_bill: true,
    });
  }

  async function saveDiagnosis() {
    if (!diagnosisModal || !diagnosisForm.diagnosis) return;
    setSaving(true);
    setBillResult(null);

    await apiFetch('/api/medical-history', {
      method: 'POST',
      body: JSON.stringify({
        patient_id: diagnosisModal.patientId,
        appointment_id: diagnosisModal.appointmentId,
        diagnosis: diagnosisForm.diagnosis,
        prescription: diagnosisForm.prescription || undefined,
        notes: diagnosisForm.notes || undefined,
        visit_date: new Date().toISOString().slice(0, 10),
      }),
    });

    if (diagnosisForm.generate_bill) {
      const billRes = await apiFetch('/api/billing', {
        method: 'POST',
        body: JSON.stringify({
          appointment_id: diagnosisModal.appointmentId,
          file_fee: diagnosisForm.file_fee,
          service_fee: diagnosisForm.service_fee,
          patient_category: diagnosisForm.patient_category,
          notes: diagnosisForm.notes || undefined,
        }),
      });
      if (billRes.ok) {
        const d = await billRes.json();
        setBillResult({ billId: d.data?.billId, total: d.data?.totalAmount });
      }
    }

    setSaving(false);
    if (!diagnosisForm.generate_bill) {
      setDiagnosisModal(null);
    }
  }

  function closeModal() {
    setDiagnosisModal(null);
    setBillResult(null);
    setDiagnosisForm({ diagnosis: '', prescription: '', notes: '', patient_category: 'H1', file_fee: 0, service_fee: 0, generate_bill: true });
  }

  const seen = new Set<number>();
  const uniqueQueue = queue.filter((e) => {
    if (seen.has(e.appointment_id)) return false;
    seen.add(e.appointment_id);
    return true;
  });

  const waiting = uniqueQueue.filter((q) => q.status === 'Waiting');
  const inProgress = uniqueQueue.filter((q) => q.status === 'In-Progress');
  const done = uniqueQueue.filter((q) => ['Completed', 'No-Show', 'Skipped', 'Referred'].includes(q.status));

  return (
    <div>
      <Header title="Queue" subtitle={new Date(selectedDate).toLocaleDateString('en-ZA', { dateStyle: 'full' })} />
      <div className="p-8 space-y-6">
        {/* Date navigation */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedDate((d) => { const dt = new Date(d); dt.setDate(dt.getDate() - 1); return dt.toISOString().slice(0, 10); })}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >← Prev</button>
          <Input
            label=""
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-44"
          />
          <button
            onClick={() => setSelectedDate((d) => { const dt = new Date(d); dt.setDate(dt.getDate() + 1); return dt.toISOString().slice(0, 10); })}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >Next →</button>
          <button
            onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >Today</button>
        </div>
        {/* In Progress */}
        {inProgress.map((entry) => (
          <div key={entry.id} className="rounded-xl border-2 border-blue-400 bg-blue-50 p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-2">Currently Serving</p>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="flex items-center gap-2 text-xl font-bold text-gray-900">
                  {entry.patient_name} <TriageBadge category={entry.triage_category} /> {entry.ai_flagged && <AiFlagPill />}
                </p>
                <p className="text-sm text-gray-500">
                  Appt: {new Date(entry.appointment_datetime).toLocaleTimeString('en-ZA')}
                </p>
              </div>
              <div className="flex gap-3 flex-wrap">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openDiagnosisModal({ appointmentId: entry.appointment_id, patientId: entry.patient_id, consultationFee: entry.consultation_fee ?? 0, careType: entry.care_type ?? 'Public' })}
                >
                  📝 Add Diagnosis
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setReferEntry(entry)}>↗ Refer</Button>
                <Button
                  variant="success"
                  size="sm"
                  loading={actionLoading === entry.id}
                  onClick={() => queueAction(entry.id, 'complete')}
                >
                  ✅ Complete
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={actionLoading === entry.id}
                  onClick={() => queueAction(entry.id, 'no-show')}
                >
                  No-Show
                </Button>
              </div>
            </div>
          </div>
        ))}

        {/* Waiting Queue */}
        <Card title={`Waiting (${waiting.length})`}>
          {loading ? (
            <div className="flex justify-center py-8"><span className="animate-spin text-3xl">⏳</span></div>
          ) : waiting.length === 0 ? (
            <p className="text-center text-gray-500 py-6">No patients waiting.</p>
          ) : (
            <div className="space-y-3">
              {waiting.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center gap-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-600">
                      #{entry.queue_position}
                    </span>
                    <div>
                      <p className="flex flex-wrap items-center gap-2 font-medium text-gray-900">
                        {entry.patient_name} <TriageBadge category={entry.triage_category} /> {entry.ai_flagged && <AiFlagPill />}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(entry.appointment_datetime).toLocaleTimeString('en-ZA')}
                        {' · '}{entry.patients_ahead} ahead
                        {entry.estimated_wait_minutes !== null && ` · ~${entry.estimated_wait_minutes} min`}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant={entry.triage_category ? 'ghost' : 'blue'} onClick={() => setTriageEntry(entry)}>
                      {entry.triage_category ? 'Re-triage' : '🩺 Triage'}
                    </Button>
                    {!inProgress.length && (
                      <Button size="sm" loading={actionLoading === entry.id}
                        onClick={() => queueAction(entry.id, 'call')}>
                        📢 Call
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" loading={actionLoading === entry.id}
                      onClick={() => queueAction(entry.id, 'skip')}>
                      Skip
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Completed */}
        {done.length > 0 && (
          <Card title={`Completed Today (${done.length})`}>
            <div className="space-y-2">
              {done.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between py-2 text-sm text-gray-600">
                  <span>
                    {entry.patient_name}
                    {entry.status === 'Referred' && entry.referred_to && (
                      <span className="ml-2 text-xs text-purple-700">→ {entry.referred_to}</span>
                    )}
                  </span>
                  {statusBadge(entry.status)}
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
          key={referEntry.id} open entry={referEntry} loading={actionLoading === referEntry.id}
          onClose={() => setReferEntry(null)}
          onConfirm={(referred_to, referral_reason) => queueAction(referEntry.id, 'refer', { referred_to, referral_reason })}
        />
      )}

      {/* Diagnosis + Billing Modal */}
      <Modal open={!!diagnosisModal?.open} onClose={closeModal} title="Add Diagnosis & Generate Bill" size="lg">
        {billResult ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-green-50 border border-green-200 p-6 text-center space-y-2">
              <p className="text-3xl">✅</p>
              <p className="text-lg font-bold text-green-800">Bill Generated Successfully</p>
              <p className="text-sm text-gray-600">Ref: <span className="font-mono font-bold">BILL-{billResult.billId}</span></p>
              <p className="text-2xl font-extrabold text-gray-900">
                {billResult.total === 0 ? 'FREE' : `R${Number(billResult.total).toFixed(2)}`}
              </p>
              <p className="text-xs text-green-700">Invoice emailed to the patient automatically.</p>
            </div>
            <div className="flex justify-end">
              <Button onClick={closeModal}>Close</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Medical record section */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Medical Record</p>
              <div className="space-y-3">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Diagnosis <span className="text-red-500">*</span></label>
                  <textarea value={diagnosisForm.diagnosis}
                    onChange={(e) => setDiagnosisForm((f) => ({ ...f, diagnosis: e.target.value }))}
                    rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                    placeholder="Primary diagnosis..." />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Prescription <span className="text-gray-400 font-normal">(optional)</span></label>
                  <textarea value={diagnosisForm.prescription}
                    onChange={(e) => setDiagnosisForm((f) => ({ ...f, prescription: e.target.value }))}
                    rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                    placeholder="Medications, dosage, instructions..." />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                  <textarea value={diagnosisForm.notes}
                    onChange={(e) => setDiagnosisForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                    placeholder="Follow-up instructions, referrals..." />
                </div>
              </div>
            </div>

            {/* Billing section */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Billing</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={diagnosisForm.generate_bill}
                    onChange={(e) => setDiagnosisForm((f) => ({ ...f, generate_bill: e.target.checked }))}
                    className="rounded" />
                  <span className="text-sm text-gray-600">Generate bill &amp; email invoice</span>
                </label>
              </div>

              {diagnosisForm.generate_bill && (
                <div className="space-y-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">Patient Category</label>
                    <select value={diagnosisForm.patient_category}
                      onChange={(e) => setDiagnosisForm((f) => ({ ...f, patient_category: e.target.value as typeof f.patient_category }))}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 outline-none">
                      <option value="Private">Private Patient</option>
                      <option value="H1">H1 — Subsidised</option>
                      <option value="H2">H2 — Co-payment</option>
                      <option value="H3">H3 — Standard rate</option>
                      <option value="Indigent">Indigent (Free)</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium text-gray-700">Consultation Fee (R)</label>
                      <input type="number" min={0} step={0.01}
                        value={diagnosisForm.service_fee}
                        onChange={(e) => setDiagnosisForm((f) => ({ ...f, service_fee: Number(e.target.value) }))}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 outline-none" />
                      {diagnosisModal && diagnosisModal.consultationFee > 0 && (
                        <p className="text-xs text-gray-400">Standard: R{diagnosisModal.consultationFee}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium text-gray-700">File Fee (R)</label>
                      <input type="number" min={0} step={0.01}
                        value={diagnosisForm.file_fee}
                        onChange={(e) => setDiagnosisForm((f) => ({ ...f, file_fee: Number(e.target.value) }))}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 outline-none" />
                    </div>
                  </div>
                  <div className="rounded-lg bg-white border border-gray-200 px-4 py-2 flex justify-between text-sm">
                    <span className="text-gray-500">Total</span>
                    <span className="font-bold text-gray-900">
                      {diagnosisForm.service_fee + diagnosisForm.file_fee === 0
                        ? 'FREE'
                        : `R${(diagnosisForm.service_fee + diagnosisForm.file_fee).toFixed(2)}`}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={closeModal}>Cancel</Button>
              <Button loading={saving} onClick={saveDiagnosis} disabled={!diagnosisForm.diagnosis}>
                Save &amp; {diagnosisForm.generate_bill ? 'Generate Bill' : 'Record Only'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
