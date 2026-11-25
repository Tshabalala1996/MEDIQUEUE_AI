'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function CreateReceptionistPage() {
  const { apiFetch } = useApi();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    email: '', password: '', first_name: '', last_name: '',
    phone_number: '', id_number: '',
  });

  function update(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          first_name: form.first_name,
          last_name: form.last_name,
          phone_number: form.phone_number || undefined,
          id_number: form.id_number,
          role: 'Receptionist',
        }),
      });
      const data = await res.json();

      if (!res.ok) { setError(data.error ?? 'Failed to create receptionist'); setLoading(false); return; }

      setSuccess(`${form.first_name} ${form.last_name} has been created as a Receptionist.`);
      setTimeout(() => router.push('/admin/users'), 2000);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Header title="Add Receptionist" subtitle="Create a new receptionist account" />
      <div className="p-8 max-w-lg space-y-6">
        {success && (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-100 px-5 py-4 text-sm text-emerald-700 font-medium">
            ✓ {success}
          </div>
        )}
        {error && (
          <div className="rounded-2xl bg-red-50 border border-red-100 px-5 py-4 text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <Card title="Account Credentials">
            <div className="space-y-4">
              <Input label="Email address *" type="email" value={form.email}
                onChange={(e) => update('email', e.target.value)} required placeholder="receptionist@hospital.co.za" />
              <Input label="Temporary Password *" type="password" value={form.password}
                onChange={(e) => update('password', e.target.value)} required
                hint="Staff member can change this after first login" />
            </div>
          </Card>

          <Card title="Personal Details">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input label="First Name *" value={form.first_name}
                  onChange={(e) => update('first_name', e.target.value)} required />
                <Input label="Last Name *" value={form.last_name}
                  onChange={(e) => update('last_name', e.target.value)} required />
              </div>
              <Input label="SA ID Number *" value={form.id_number}
                onChange={(e) => update('id_number', e.target.value)} required
                placeholder="0001010000089" maxLength={13} />
              <Input label="Phone Number" type="tel" value={form.phone_number}
                onChange={(e) => update('phone_number', e.target.value)} placeholder="0821234567" />
            </div>
          </Card>

          <div className="rounded-2xl bg-[#EEF2FF] border border-[#2346E8]/20 px-5 py-4 text-sm text-[#2346E8]">
            <p className="font-semibold mb-1">What receptionists can do:</p>
            <ul className="text-xs text-[#2346E8]/70 space-y-1 mt-2">
              <li>✓ Manage the daily patient queue</li>
              <li>✓ Register walk-in patients</li>
              <li>✓ Create doctor accounts for their hospital</li>
              <li>✓ Call, complete, skip, or mark no-show patients</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              ← Cancel
            </Button>
            <Button type="submit" loading={loading} size="lg" className="flex-1">
              Create Receptionist Account
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
