'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import type { Specialization, Hospital } from '@/types';

export default function CreateDoctorPage() {
  const { apiFetch } = useApi();
  const router = useRouter();

  const [specializations, setSpecializations] = useState<Specialization[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    email: '', password: '', first_name: '', last_name: '',
    phone_number: '', id_number: '',
    hpcsa_number: '', practice_number: '',
    specialization_id: '', consultation_fee: '',
    years_of_experience: '', bio: '',
    hospital_id: '',
  });

  function update(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  useEffect(() => {
    apiFetch('/api/specializations').then((r) => r.json()).then((d) => setSpecializations(d.data ?? []));
    apiFetch('/api/hospitals?limit=100').then((r) => r.json()).then((d) => setHospitals(d.data ?? []));
  }, [apiFetch]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.hpcsa_number || !form.specialization_id || !form.consultation_fee) {
      setError('HPCSA number, specialization, and consultation fee are required.');
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        email: form.email,
        password: form.password,
        first_name: form.first_name,
        last_name: form.last_name,
        phone_number: form.phone_number || undefined,
        id_number: form.id_number,
        role: 'Doctor',
        hpcsa_number: form.hpcsa_number.toUpperCase(),
        specialization_id: Number(form.specialization_id),
        consultation_fee: Number(form.consultation_fee),
      };
      if (form.practice_number)     body.practice_number     = form.practice_number;
      if (form.years_of_experience) body.years_of_experience = Number(form.years_of_experience);
      if (form.bio)                 body.bio                 = form.bio;

      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) { setError(data.error ?? 'Failed to create doctor'); setLoading(false); return; }

      // Optionally assign to hospital
      const newDoctorId = data.data?.doctorId ?? data.data?.user?.doctorId;
      if (form.hospital_id && newDoctorId) {
        const doctorId = newDoctorId;
        await apiFetch('/api/admin/assign-doctor', {
          method: 'POST',
          body: JSON.stringify({
            doctor_id: doctorId,
            facility_type: 'Hospital',
            facility_id: Number(form.hospital_id),
          }),
        }).catch(() => null);
      }

      setSuccess(`Dr. ${form.first_name} ${form.last_name} has been created successfully.`);
      setTimeout(() => router.push('/receptionist'), 2000);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Header title="Create Doctor Account" subtitle="Register a new doctor and assign them to a hospital" />
      <div className="p-8 max-w-2xl space-y-6">
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
                onChange={(e) => update('email', e.target.value)} required placeholder="doctor@hospital.co.za" />
              <Input label="Temporary Password *" type="password" value={form.password}
                onChange={(e) => update('password', e.target.value)} required
                hint="Doctor can change this after first login" />
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

          <Card title="Professional Details">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input label="HPCSA Number *" value={form.hpcsa_number}
                  onChange={(e) => update('hpcsa_number', e.target.value.toUpperCase())}
                  required placeholder="MP1234567" hint="Format: MP1234567" />
                <Input label="Practice Number" value={form.practice_number}
                  onChange={(e) => update('practice_number', e.target.value)} />
              </div>
              <Select
                label="Specialization *"
                value={form.specialization_id}
                onChange={(e) => update('specialization_id', e.target.value)}
                options={specializations.map((s) => ({ value: s.id, label: s.name }))}
                placeholder="Select specialization"
              />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Consultation Fee (ZAR) *" type="number" value={form.consultation_fee}
                  onChange={(e) => update('consultation_fee', e.target.value)} placeholder="850" />
                <Input label="Years of Experience" type="number" value={form.years_of_experience}
                  onChange={(e) => update('years_of_experience', e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-[#0D1F3C]/80">Professional Bio</label>
                <textarea value={form.bio} onChange={(e) => update('bio', e.target.value)}
                  rows={3} placeholder="Brief professional biography..."
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none
                    transition-all hover:border-[#2346E8]/40 focus:border-[#2346E8] focus:ring-2 focus:ring-[#2346E8]/20" />
              </div>
            </div>
          </Card>

          <Card title="Hospital Assignment (Optional)">
            <Select
              label="Assign to Hospital"
              value={form.hospital_id}
              onChange={(e) => update('hospital_id', e.target.value)}
              options={hospitals.map((h) => ({ value: h.id, label: `${h.name} — ${h.city}` }))}
              placeholder="Select a hospital (optional)"
            />
            <p className="mt-2 text-xs text-gray-400">
              You can also assign the doctor to more hospitals later from the Admin panel.
            </p>
          </Card>

          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              ← Cancel
            </Button>
            <Button type="submit" loading={loading} size="lg" className="flex-1">
              Create Doctor Account
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
