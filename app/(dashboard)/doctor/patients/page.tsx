'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { MedicalHistory } from '@/types';

interface PatientRow { id: number; user_id: number; first_name: string; last_name: string; email: string; phone_number: string | null; date_of_birth: string | null; blood_type: string | null; allergies: string | null; medical_aid_provider: string | null }

export default function DoctorPatientsPage() {
  const { apiFetch } = useApi();
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<PatientRow | null>(null);
  const [history, setHistory] = useState<MedicalHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '50' });
    if (search) params.set('search', search);
    const res = await apiFetch(`/api/patients?${params}`);
    if (res.ok) { const d = await res.json(); setPatients(d.data ?? []); }
    setLoading(false);
  }, [search, apiFetch]);

  useEffect(() => { load(); }, [load]);

  async function viewHistory(patient: PatientRow) {
    setSelectedPatient(patient);
    setHistoryLoading(true);
    const res = await apiFetch(`/api/medical-history?patient_id=${patient.id}`);
    if (res.ok) { const d = await res.json(); setHistory(d.data ?? []); }
    setHistoryLoading(false);
  }

  return (
    <div>
      <Header title="My Patients" subtitle="View patient information and medical history" />
      <div className="p-8 space-y-5">
        <Input
          label=""
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search patients by name, email, or ID..."
          className="max-w-sm"
        />

        <Card>
          {loading ? (
            <div className="flex justify-center py-12"><span className="animate-spin text-3xl">⏳</span></div>
          ) : patients.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No patients found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className="pb-3 pr-4">Name</th>
                    <th className="pb-3 pr-4">Contact</th>
                    <th className="pb-3 pr-4">DOB</th>
                    <th className="pb-3 pr-4">Blood Type</th>
                    <th className="pb-3 pr-4">Medical Aid</th>
                    <th className="pb-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {patients.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="py-3 pr-4 font-medium">{p.first_name} {p.last_name}</td>
                      <td className="py-3 pr-4 text-gray-500">
                        <div>{p.email}</div>
                        <div className="text-xs">{p.phone_number ?? '—'}</div>
                      </td>
                      <td className="py-3 pr-4 text-gray-500">{p.date_of_birth ?? '—'}</td>
                      <td className="py-3 pr-4 text-gray-500">{p.blood_type ?? '—'}</td>
                      <td className="py-3 pr-4 text-gray-500">{p.medical_aid_provider ?? 'None'}</td>
                      <td className="py-3">
                        <Button size="sm" variant="ghost" onClick={() => viewHistory(p)}>View History</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={!!selectedPatient}
        onClose={() => { setSelectedPatient(null); setHistory([]); }}
        title={`${selectedPatient?.first_name} ${selectedPatient?.last_name} — Medical History`}
        size="xl"
      >
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {historyLoading ? (
            <div className="flex justify-center py-8"><span className="animate-spin text-3xl">⏳</span></div>
          ) : history.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No medical history on file.</p>
          ) : (
            history.map((rec) => (
              <div key={rec.id} className="rounded-lg border border-gray-200 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-gray-700">{new Date(rec.visit_date).toLocaleDateString('en-ZA', { dateStyle: 'long' })}</span>
                  {rec.doctor_name && <span className="text-blue-600">{rec.doctor_name}</span>}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-gray-400">Diagnosis</p>
                  <p className="text-sm text-gray-900">{rec.diagnosis}</p>
                </div>
                {rec.prescription && (
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-400">Prescription</p>
                    <p className="text-sm text-gray-700 whitespace-pre-line">{rec.prescription}</p>
                  </div>
                )}
                {rec.notes && (
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-400">Notes</p>
                    <p className="text-sm text-gray-600">{rec.notes}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}
