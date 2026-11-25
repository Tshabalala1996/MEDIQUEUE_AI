'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';

const ROLES = [
  { value: 'Nurse', label: 'Nurse — triage patients and update queue status' },
  { value: 'Receptionist', label: 'Receptionist — manage queues, walk-ins and billing' },
  { value: 'Admin', label: 'Administrator — full system access' },
];

export default function CreateStaffPage() {
  const { apiFetch } = useApi();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({
    role: 'Nurse', email: '', password: '', first_name: '', last_name: '', phone_number: '', id_number: '',
  });

  const update = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(''); setSuccess('');
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ ...form, phone_number: form.phone_number || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.data?.[0] ? `${data.data[0].path}: ${data.data[0].message}` : data.error ?? 'Failed to create the account');
        return;
      }
      setSuccess(`${form.first_name} ${form.last_name} has been created as ${form.role}.`);
      setTimeout(() => router.push('/admin/users'), 1800);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Header title="Add Staff" subtitle="Create a nurse, receptionist or administrator account" />
      <div className="max-w-lg space-y-6 p-8">
        {success && <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700">✓ {success}</div>}
        {error && <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-600">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-5">
          <Card title="Role">
            <Select label="Account type *" value={form.role} onChange={(e) => update('role', e.target.value)} options={ROLES} />
          </Card>

          <Card title="Account Credentials">
            <div className="space-y-4">
              <Input label="Email address *" type="email" value={form.email} required
                onChange={(e) => update('email', e.target.value)} placeholder="name@hospital.co.za" />
              <Input label="Temporary Password *" type="password" value={form.password} required minLength={8}
                onChange={(e) => update('password', e.target.value)} hint="At least 8 characters. The staff member should change it after first login." />
            </div>
          </Card>

          <Card title="Personal Details">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input label="First Name *" value={form.first_name} required onChange={(e) => update('first_name', e.target.value)} />
                <Input label="Last Name *" value={form.last_name} required onChange={(e) => update('last_name', e.target.value)} />
              </div>
              <Input label="SA ID Number *" value={form.id_number} required maxLength={13}
                onChange={(e) => update('id_number', e.target.value)} placeholder="0001010000089" />
              <Input label="Phone Number" type="tel" value={form.phone_number}
                onChange={(e) => update('phone_number', e.target.value)} placeholder="0821234567" />
            </div>
          </Card>

          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={() => router.back()}>← Cancel</Button>
            <Button type="submit" loading={loading} size="lg" className="flex-1">Create {form.role} Account</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
