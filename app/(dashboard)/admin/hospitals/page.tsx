'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SA_PROVINCES, type Hospital } from '@/types';

const EMPTY: Partial<Hospital> = { name: '', type: 'Public', province: 'Gauteng', city: '', address: '', phone_number: '', email: '' };

export default function AdminHospitalsPage() {
  const { apiFetch } = useApi();
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Partial<Hospital>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [assignDoctor, setAssignDoctor] = useState<{ hospitalId: number; doctorId: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch('/api/hospitals?limit=100');
    if (res.ok) { const d = await res.json(); setHospitals(d.data ?? []); }
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  async function saveHospital() {
    setSaving(true); setMessage('');
    const method = form.id ? 'PATCH' : 'POST';
    const url = form.id ? `/api/hospitals/${form.id}` : '/api/hospitals';
    const res = await apiFetch(url, { method, body: JSON.stringify(form) });
    const d = await res.json();
    setSaving(false);
    if (res.ok) { setMessage('✅ Saved'); setModalOpen(false); load(); setForm(EMPTY); }
    else setMessage(`❌ ${d.error}`);
  }

  async function deactivate(id: number) {
    if (!confirm('Deactivate this hospital?')) return;
    await apiFetch(`/api/hospitals/${id}`, { method: 'DELETE' });
    load();
  }

  async function doAssignDoctor() {
    if (!assignDoctor) return;
    await apiFetch('/api/admin/assign-doctor', {
      method: 'POST',
      body: JSON.stringify({ doctor_id: Number(assignDoctor.doctorId), facility_type: 'Hospital', facility_id: assignDoctor.hospitalId }),
    });
    setAssignDoctor(null);
    alert('Doctor assigned!');
  }

  function update(k: keyof Hospital, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  return (
    <div>
      <Header title="Hospital Management" subtitle="Add, edit, and manage hospital facilities" />
      <div className="p-8 space-y-5">
        <div className="flex justify-end">
          <Button onClick={() => { setForm(EMPTY); setModalOpen(true); }}>+ Add Hospital</Button>
        </div>
        <Card>
          {loading ? (
            <div className="flex justify-center py-12"><span className="animate-spin text-3xl">⏳</span></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className="pb-3 pr-4">Name</th>
                    <th className="pb-3 pr-4">Type</th>
                    <th className="pb-3 pr-4">Province</th>
                    <th className="pb-3 pr-4">City</th>
                    <th className="pb-3 pr-4">Rating</th>
                    <th className="pb-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {hospitals.map((h) => (
                    <tr key={h.id} className="hover:bg-gray-50">
                      <td className="py-3 pr-4 font-medium">{h.name}</td>
                      <td className="py-3 pr-4 text-gray-500">{h.type}</td>
                      <td className="py-3 pr-4 text-gray-500">{h.province}</td>
                      <td className="py-3 pr-4 text-gray-500">{h.city}</td>
                      <td className="py-3 pr-4">⭐ {Number(h.average_rating).toFixed(1)}</td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost"
                            onClick={() => { setForm(h); setModalOpen(true); }}>Edit</Button>
                          <Button size="sm" variant="ghost"
                            onClick={() => setAssignDoctor({ hospitalId: h.id, doctorId: '' })}>+ Doctor</Button>
                          <Button size="sm" variant="danger" onClick={() => deactivate(h.id)}>Deactivate</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={form.id ? 'Edit Hospital' : 'Add Hospital'} size="lg">
        <div className="space-y-4">
          <Input label="Hospital Name" value={form.name ?? ''} onChange={(e) => update('name', e.target.value)} required />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Type" value={form.type ?? 'Public'}
              onChange={(e) => update('type', e.target.value as 'Public' | 'Private')}
              options={[{ value: 'Public', label: 'Public' }, { value: 'Private', label: 'Private' }]} />
            <Select label="Province" value={form.province ?? 'Gauteng'}
              onChange={(e) => update('province', e.target.value)}
              options={SA_PROVINCES.map((p) => ({ value: p, label: p }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="City" value={form.city ?? ''} onChange={(e) => update('city', e.target.value)} />
            <Input label="Phone" value={form.phone_number ?? ''} onChange={(e) => update('phone_number', e.target.value)} />
          </div>
          <Input label="Address" value={form.address ?? ''} onChange={(e) => update('address', e.target.value)} />
          <Input label="Email" type="email" value={form.email ?? ''} onChange={(e) => update('email', e.target.value)} />
          {message && <p className={`text-sm ${message.startsWith('✅') ? 'text-green-600' : 'text-red-600'}`}>{message}</p>}
          <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={saveHospital}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Assign Doctor Modal */}
      <Modal open={!!assignDoctor} onClose={() => setAssignDoctor(null)} title="Assign Doctor to Hospital">
        <div className="space-y-4">
          <Input label="Doctor ID" type="number" value={assignDoctor?.doctorId ?? ''}
            onChange={(e) => setAssignDoctor((a) => a ? { ...a, doctorId: e.target.value } : null)} />
          <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={() => setAssignDoctor(null)}>Cancel</Button>
            <Button onClick={doAssignDoctor}>Assign</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
