'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { Header } from '@/components/layout/Header';
import { StatCard } from '@/components/ui/Card';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import Link from 'next/link';

interface Analytics {
  appointments: { status: string; count: number }[];
  top_specializations: { name: string; booking_count: number }[];
  revenue: { total_revenue: number; avg_fee: number };
  no_show_rate: { total: number; no_shows: number };
  facility_popularity: { facility_name: string; appointment_count: number }[];
  waiting_times?: { avg_wait_minutes: number | null; max_wait_minutes: number | null };
  patients?: { unique_patients: number; visits: number };
  live_queue?: Record<string, number>;
}

export default function AdminDashboard() {
  const { apiFetch } = useApi();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/admin/analytics?period=${period}`).then(async (r) => {
      if (r.ok) { const d = await r.json(); setAnalytics(d.data); }
      setLoading(false);
    });
  }, [period, apiFetch]);

  const totalApts = analytics?.appointments.reduce((s, a) => s + Number(a.count), 0) ?? 0;
  const completedApts = analytics?.appointments.find((a) => a.status === 'Completed')?.count ?? 0;
  const noShowRate = analytics?.no_show_rate
    ? ((analytics.no_show_rate.no_shows / Math.max(analytics.no_show_rate.total, 1)) * 100).toFixed(1)
    : '0';

  return (
    <div>
      <Header title="Admin Dashboard" subtitle="System overview and analytics" />
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Overview</h2>
          <Select label="" value={period}
            onChange={(e) => setPeriod(e.target.value)}
            options={[{ value: 'day', label: 'Today' }, { value: 'week', label: 'This Week' }, { value: 'month', label: 'This Month' }]}
            className="w-36" />
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><span className="animate-spin text-4xl">⏳</span></div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total Appointments" value={totalApts} icon="📅" color="blue" />
              <StatCard label="Completed" value={completedApts} icon="✅" color="green" />
              <StatCard label="No-Show Rate" value={`${noShowRate}%`} icon="⚠️" color="red" />
              <StatCard label="Revenue (ZAR)" value={`R${Number(analytics?.revenue.total_revenue ?? 0).toLocaleString('en-ZA')}`} icon="💰" color="purple" />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Avg Wait Time" icon="⏱" color="navy"
                value={analytics?.waiting_times?.avg_wait_minutes != null ? `${analytics.waiting_times.avg_wait_minutes} min` : '—'}
                sub={analytics?.waiting_times?.max_wait_minutes != null ? `Longest ${analytics.waiting_times.max_wait_minutes} min` : 'No consultations yet'} />
              <StatCard label="Patients Seen" value={analytics?.patients?.unique_patients ?? 0} icon="👥" color="blue"
                sub={`${analytics?.patients?.visits ?? 0} visits`} />
              <StatCard label="Waiting Now" value={analytics?.live_queue?.Waiting ?? 0} icon="⏳" color="yellow" sub="today's queue" />
              <StatCard label="Being Attended" value={analytics?.live_queue?.['In-Progress'] ?? 0} icon="♥" color="green" sub="today's queue" />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Top Specializations */}
              <Card title="Top Specializations">
                <div className="space-y-2">
                  {analytics?.top_specializations.slice(0, 8).map((s) => (
                    <div key={s.name} className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-gray-700">{s.name}</span>
                          <span className="text-gray-500">{s.booking_count}</span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100">
                          <div className="h-2 rounded-full bg-blue-500"
                            style={{ width: `${(s.booking_count / (analytics?.top_specializations[0]?.booking_count || 1)) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Facility Popularity */}
              <Card title="Facility Popularity">
                <div className="space-y-2">
                  {analytics?.facility_popularity.slice(0, 8).map((f) => (
                    <div key={f.facility_name} className="flex items-center justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                      <span className="text-gray-700">{f.facility_name || '—'}</span>
                      <span className="font-medium text-gray-900">{f.appointment_count} appointments</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Quick links */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {[
                { href: '/admin/users',                icon: '♟', label: 'Manage Users',       color: 'bg-[#EEF2FF] text-[#2346E8]' },
                { href: '/admin/appointments',         icon: '▤', label: 'Appointments',        color: 'bg-sky-50 text-sky-600' },
                { href: '/admin/queues',               icon: '≡', label: 'Queues',              color: 'bg-orange-50 text-orange-600' },
                { href: '/admin/analytics',            icon: '▦', label: 'Full Analytics',      color: 'bg-violet-50 text-violet-600' },
                { href: '/admin/reports',              icon: '▧', label: 'Reports',             color: 'bg-emerald-50 text-emerald-600' },
                { href: '/admin/hospitals',            icon: '◈', label: 'Hospitals',           color: 'bg-teal-50 text-teal-600' },
                { href: '/admin/clinics',              icon: '◉', label: 'Clinics',             color: 'bg-amber-50 text-amber-600' },
                { href: '/admin/create-staff',         icon: '＋', label: 'Add Staff',          color: 'bg-[#0D1F3C] text-white' },
                { href: '/admin/settings',             icon: '⚙', label: 'System Settings',     color: 'bg-gray-100 text-gray-700' },
              ].map((a) => (
                <Link key={a.href} href={a.href}
                  className="flex flex-col items-start gap-3 rounded-2xl border border-gray-100 bg-white p-5 hover:border-[#2346E8]/30 hover:shadow-md transition-all group">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${a.color}`}>
                    {a.icon}
                  </div>
                  <span className="text-sm font-bold text-[#0D1F3C] group-hover:text-[#2346E8] transition-colors">{a.label}</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
