'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SA_PROVINCES, type Clinic } from '@/types';

const EMPTY: Partial<Clinic> = { name: '', type: 'GP', province: 'Gauteng', city: '', address: '', phone_number: '', email: '' };

export default function AdminClinicsPage() {
  const { apiFetch } = useApi();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Partial<Clinic>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [assignDoctor, setAssignDoctor] = useState<{ clinicId: number; doctorId: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch('/api/clinics?limit=100');
    if (res.ok) { const d = await res.json(); setClinics(d.data ?? []); }
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  async function saveClinic() {
    setSaving(true); setMessage('');
    const method = form.id ? 'PATCH' : 'POST';
    const url = form.id ? `/api/clinics/${form.id}` : '/api/clinics';
    const res = await apiFetch(url, { method, body: JSON.stringify(form) });
    const d = await res.json();
    setSaving(false);
    if (res.ok) { setMessage('✅ Saved'); setModalOpen(false); load(); setForm(EMPTY); }
    else setMessage(`❌ ${d.error}`);
  }

  async function deactivate(id: number) {
    if (!confirm('Deactivate this clinic?')) return;
    await apiFetch(`/api/clinics/${id}`, { method: 'DELETE' });
    load();
  }

  async function doAssignDoctor() {
    if (!assignDoctor) return;
    await apiFetch('/api/admin/assign-doctor', {
      method: 'POST',
      body: JSON.stringify({ doctor_id: Number(assignDoctor.doctorId), facility_type: 'Clinic', facility_id: assignDoctor.clinicId }),
    });
    setAssignDoctor(null);
    alert('Doctor assigned to clinic!');
  }

  function update(k: keyof Clinic, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  return (
    <div>
      <Header title="Clinic Management" subtitle="Manage independent GP clinics and community centres" />
      <div className="p-8 space-y-5">
        <div className="flex justify-end">
          <Button onClick={() => { setForm(EMPTY); setModalOpen(true); }}>+ Add Clinic</Button>
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
                    <th className="pb-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {clinics.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="py-3 pr-4 font-medium">{c.name}</td>
                      <td className="py-3 pr-4 text-gray-500">{c.type}</td>
                      <td className="py-3 pr-4 text-gray-500">{c.province}</td>
                      <td className="py-3 pr-4 text-gray-500">{c.city}</td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => { setForm(c); setModalOpen(true); }}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => setAssignDoctor({ clinicId: c.id, doctorId: '' })}>+ Doctor</Button>
                          <Button size="sm" variant="danger" onClick={() => deactivate(c.id)}>Deactivate</Button>
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={form.id ? 'Edit Clinic' : 'Add Clinic'} size="lg">
        <div className="space-y-4">
          <Input label="Clinic Name" value={form.name ?? ''} onChange={(e) => update('name', e.target.value)} required />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Type" value={form.type ?? 'GP'}
              onChange={(e) => update('type', e.target.value as Clinic['type'])}
              options={['GP', 'Community', 'Specialist', 'Other'].map((v) => ({ value: v, label: v }))} />
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
            <Button loading={saving} onClick={saveClinic}>Save</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!assignDoctor} onClose={() => setAssignDoctor(null)} title="Assign Doctor to Clinic">
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
