'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { Role } from '@/types';

const ROLE_HOME: Record<Role, string> = {
  Patient: '/patient',
  Doctor: '/doctor',
  Nurse: '/nurse',
  Receptionist: '/receptionist',
  Admin: '/admin',
};

export function LoginInner() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    if (!result.success) {
      setError(result.error ?? 'Login failed');
      return;
    }

    const from = searchParams.get('from');
    if (from) { router.push(from); return; }

    const role = result.roles?.[0];
    router.push(role && ROLE_HOME[role] ? ROLE_HOME[role] : '/patient');
  }

  return (
    <div className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center bg-[#060E22] px-4">

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

        {/* Glass card */}
        <div className="w-full rounded-3xl p-8 shadow-2xl" style={{
          background: 'rgba(255,255,255,0.06)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
        }}>
          <h1 className="text-xl font-extrabold text-white mb-1">Welcome back</h1>
          <p className="text-xs text-white/40 mb-6">Sign in to your account to continue</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-white/60 uppercase tracking-wide">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.co.za"
                required
                autoComplete="email"
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
                onFocus={(e) => { e.target.style.borderColor = 'rgba(35,70,232,0.8)'; e.target.style.background = 'rgba(35,70,232,0.12)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; e.target.style.background = 'rgba(255,255,255,0.08)'; }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-white/60 uppercase tracking-wide">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
                onFocus={(e) => { e.target.style.borderColor = 'rgba(35,70,232,0.8)'; e.target.style.background = 'rgba(35,70,232,0.12)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; e.target.style.background = 'rgba(255,255,255,0.08)'; }}
              />
            </div>

            {error && (
              <div className="rounded-xl px-4 py-3 text-xs text-red-300" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#2346E8] py-3.5 text-sm font-bold text-white transition-all hover:bg-[#1a3fda] disabled:opacity-60 shadow-lg shadow-[#2346E8]/40 mt-2"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-white/35">
            New patient?{' '}
            <Link href="/register" className="font-semibold text-[#2346E8] hover:text-[#4d72f0]">
              Create an account
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-[11px] text-white/20">
          Hospital staff accounts are created by your administrator.
        </p>
      </div>
    </div>
  );
}
