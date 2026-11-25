'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { SA_PROVINCES } from '@/types';

type Step = 'account' | 'personal' | 'medical';

const glassInputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.12)',
};

function GlassInput({ label, hint, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-white/60 uppercase tracking-wide">{label}</label>
      <input
        {...props}
        className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 outline-none transition-all"
        style={glassInputStyle}
        onFocus={(e) => { e.target.style.borderColor = 'rgba(35,70,232,0.8)'; e.target.style.background = 'rgba(35,70,232,0.12)'; props.onFocus?.(e); }}
        onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; e.target.style.background = 'rgba(255,255,255,0.08)'; props.onBlur?.(e); }}
      />
      {hint && <p className="text-[10px] text-white/30">{hint}</p>}
    </div>
  );
}

function GlassSelect({ label, options, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: { value: string; label: string }[] }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-white/60 uppercase tracking-wide">{label}</label>
      <select
        {...props}
        className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition-all appearance-none"
        style={{ ...glassInputStyle, colorScheme: 'dark' }}
        onFocus={(e) => { e.target.style.borderColor = 'rgba(35,70,232,0.8)'; e.target.style.background = 'rgba(35,70,232,0.12)'; }}
        onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; e.target.style.background = 'rgba(255,255,255,0.08)'; }}
      >
        {options.map((o) => <option key={o.value} value={o.value} style={{ background: '#0D1F3C' }}>{o.label}</option>)}
      </select>
    </div>
  );
}

const STEPS: { key: Step; label: string }[] = [
  { key: 'account', label: 'Account' },
  { key: 'personal', label: 'Personal' },
  { key: 'medical', label: 'Medical' },
];

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('account');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    email: '', password: '', confirmPassword: '',
    first_name: '', last_name: '', phone_number: '', id_number: '',
    medical_aid_provider: '', medical_aid_number: '',
    emergency_contact_name: '', emergency_contact_phone: '',
    blood_type: '', allergies: '',
  });

  function update(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (step === 'account') {
      if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return; }
      setStep('personal');
      return;
    }
    if (step === 'personal') {
      setStep('medical');
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
        role: 'Patient',
      };
      if (form.medical_aid_provider) body.medical_aid_provider = form.medical_aid_provider;
      if (form.medical_aid_number)   body.medical_aid_number   = form.medical_aid_number;
      if (form.emergency_contact_name)  body.emergency_contact_name  = form.emergency_contact_name;
      if (form.emergency_contact_phone) body.emergency_contact_phone = form.emergency_contact_phone;
      if (form.blood_type) body.blood_type = form.blood_type;
      if (form.allergies)  body.allergies  = form.allergies;

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        const firstIssue = json.data?.[0] as { path: string; message: string } | undefined;
        setError(
          firstIssue
            ? (firstIssue.path ? `${firstIssue.path}: ${firstIssue.message}` : firstIssue.message)
            : (json.error ?? 'Registration failed')
        );
        setLoading(false);
        return;
      }
      router.push('/patient');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const bloodTypes = [{ value: '', label: 'Select blood type' }, ...['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((v) => ({ value: v, label: v }))];

  return (
    <div className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center bg-[#060E22] px-4 py-10">

      {/* Background glows */}
      <div className="pointer-events-none absolute inset-0 select-none">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[700px] w-[700px] rounded-full bg-[#2346E8]/15 blur-[130px]" />
        <Image src="/logo.svg" alt="" width={380} height={380}
          className="absolute -top-20 -left-20 opacity-[0.07] blur-sm rotate-[-12deg]" aria-hidden />
        <Image src="/logo.svg" alt="" width={300} height={300}
          className="absolute -bottom-14 -right-14 opacity-[0.07] blur-sm rotate-[18deg]" aria-hidden />
        <div className="absolute inset-0 opacity-[0.025]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.6) 1px,transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4 rounded-[24px] shadow-2xl shadow-[#2346E8]/50 ring-1 ring-white/10 overflow-hidden">
            <Image src="/logo.svg" alt="MediQueue AI" width={80} height={80} priority />
          </div>
          <p className="text-2xl font-extrabold text-white tracking-wide">MediQueue AI</p>
          <p className="text-[10px] text-white/35 uppercase tracking-[0.3em] mt-1">Healthcare</p>
        </div>

        {/* Step indicators */}
        <div className="mb-5 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all
                ${step === s.key
                  ? 'bg-[#2346E8] text-white shadow-md shadow-[#2346E8]/50'
                  : stepIndex > i
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white/10 text-white/30'}`}
              >
                {stepIndex > i ? '✓' : i + 1}
              </div>
              <span className={`text-xs font-semibold ${step === s.key ? 'text-white' : 'text-white/30'}`}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div className={`h-px w-5 ${stepIndex > i ? 'bg-emerald-400' : 'bg-white/15'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Glass card */}
        <div className="w-full rounded-3xl p-8 shadow-2xl" style={{
          background: 'rgba(255,255,255,0.06)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
        }}>
          <h1 className="text-xl font-extrabold text-white mb-1">Create account</h1>
          <p className="text-xs text-white/40 mb-6">Patient registration — free &amp; secure</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {step === 'account' && (
              <>
                <GlassInput label="Email address" type="email" value={form.email}
                  onChange={(e) => update('email', e.target.value)} required placeholder="you@example.co.za" />
                <GlassInput label="Password" type="password" value={form.password}
                  onChange={(e) => update('password', e.target.value)} required hint="Minimum 8 characters" />
                <GlassInput label="Confirm Password" type="password" value={form.confirmPassword}
                  onChange={(e) => update('confirmPassword', e.target.value)} required />
              </>
            )}

            {step === 'personal' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <GlassInput label="First Name" value={form.first_name}
                    onChange={(e) => update('first_name', e.target.value)} required />
                  <GlassInput label="Last Name" value={form.last_name}
                    onChange={(e) => update('last_name', e.target.value)} required />
                </div>
                <GlassInput label="SA ID Number" value={form.id_number}
                  onChange={(e) => update('id_number', e.target.value)} required
                  placeholder="0001010000089" hint="13-digit South African ID" maxLength={13} />
                <GlassInput label="Phone Number" type="tel" value={form.phone_number}
                  onChange={(e) => update('phone_number', e.target.value)} placeholder="0821234567" />
              </>
            )}

            {step === 'medical' && (
              <>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Medical Aid (Optional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <GlassInput label="Provider" value={form.medical_aid_provider}
                    onChange={(e) => update('medical_aid_provider', e.target.value)} placeholder="Discovery…" />
                  <GlassInput label="Member No." value={form.medical_aid_number}
                    onChange={(e) => update('medical_aid_number', e.target.value)} />
                </div>
                <GlassSelect label="Blood Type" value={form.blood_type}
                  onChange={(e) => update('blood_type', e.target.value)}
                  options={bloodTypes} />
                <GlassInput label="Known Allergies" value={form.allergies}
                  onChange={(e) => update('allergies', e.target.value)} placeholder="Penicillin, peanuts…" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 pt-1">Emergency Contact (Optional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <GlassInput label="Name" value={form.emergency_contact_name}
                    onChange={(e) => update('emergency_contact_name', e.target.value)} />
                  <GlassInput label="Phone" value={form.emergency_contact_phone}
                    onChange={(e) => update('emergency_contact_phone', e.target.value)} placeholder="0821234567" />
                </div>
              </>
            )}

            {error && (
              <div className="rounded-xl px-4 py-3 text-xs text-red-300"
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              {step !== 'account' && (
                <button type="button"
                  onClick={() => setStep(step === 'medical' ? 'personal' : 'account')}
                  className="rounded-xl px-4 py-3 text-sm font-semibold text-white/60 hover:text-white transition-colors"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>
                  ← Back
                </button>
              )}
              <button type="submit" disabled={loading}
                className="flex-1 rounded-xl bg-[#2346E8] py-3 text-sm font-bold text-white transition-all hover:bg-[#1a3fda] disabled:opacity-60 shadow-lg shadow-[#2346E8]/40">
                {loading ? 'Creating…' : step === 'medical' ? 'Create Account' : 'Continue →'}
              </button>
            </div>
          </form>

          <p className="mt-5 text-center text-xs text-white/35">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-[#2346E8] hover:text-[#4d72f0]">Sign in</Link>
          </p>
        </div>

        <p className="mt-5 text-center text-[11px] text-white/20">
          Doctor or receptionist? Contact your hospital admin to get access.
        </p>
      </div>
    </div>
  );
}
