'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { Header } from '@/components/layout/Header';
import { StatCard } from '@/components/ui/Card';
import Link from 'next/link';
import type { QueueEntry } from '@/types';

const ACTIONS = [
  { href: '/receptionist/queue',        icon: '≡', label: 'Manage Queue',      desc: 'Call patients, mark complete, handle no-shows', color: 'bg-[#EEF2FF] text-[#2346E8]' },
  { href: '/receptionist/walk-in',      icon: '→', label: 'Register Walk-in',  desc: 'Quick appointment for unscheduled patients',    color: 'bg-amber-50 text-amber-600' },
  { href: '/receptionist/create-doctor',icon: '＋', label: 'Create Doctor',     desc: 'Add a new doctor account for your hospital',    color: 'bg-emerald-50 text-emerald-600' },
];

export default function ReceptionistDashboard() {
  const { apiFetch } = useApi();
  const [queue, setQueue] = useState<QueueEntry[]>([]);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    apiFetch(`/api/queue?date=${today}`).then(async (r) => {
      if (r.ok) { const d = await r.json(); setQueue(d.data ?? []); }
    });
  }, [apiFetch]);

  const waiting  = queue.filter((q) => q.status === 'Waiting').length;
  const serving  = queue.filter((q) => q.status === 'In-Progress').length;
  const done     = queue.filter((q) => q.status === 'Completed').length;

  return (
    <div>
      <Header title="Receptionist Dashboard" subtitle="Manage today's patient flow" />
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Waiting" value={waiting} icon="⏳" color="yellow" />
          <StatCard label="Being Served" value={serving} icon="♥" color="blue" />
          <StatCard label="Completed Today" value={done} icon="✓" color="green" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {ACTIONS.map((a) => (
            <Link key={a.href} href={a.href}
              className="flex items-start gap-4 rounded-2xl border border-gray-100 bg-white p-6
                hover:border-[#2346E8]/30 hover:shadow-md transition-all group">
              <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-xl ${a.color}`}>
                {a.icon}
              </div>
              <div>
                <p className="font-bold text-[#0D1F3C] group-hover:text-[#2346E8] transition-colors">{a.label}</p>
                <p className="text-sm text-gray-400 mt-0.5">{a.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
