'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { Header } from '@/components/layout/Header';
import { Card, StatCard } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { TriageBadge } from '@/components/queue/TriageBadge';
import type { TriageCategory } from '@/types';

interface Analytics {
  period: string;
  appointments: { status: string; count: number }[];
  top_specializations: { name: string; booking_count: number }[];
  doctor_performance: { doctor_name: string; average_rating: number; total_reviews: number; no_shows: number; total_appointments: number }[];
  facility_popularity: { facility_type: string; facility_name: string; appointment_count: number }[];
  revenue: { total_revenue: number; avg_fee: number };
  no_show_rate: { total: number; no_shows: number };
  waiting_times: { samples: number; avg_wait_minutes: number | null; max_wait_minutes: number | null; avg_consultation_minutes: number | null };
  patients: { unique_patients: number; visits: number };
  live_queue: Record<string, number>;
  triage_mix: { category: string; count: number; avg_wait_minutes: number | null }[];
  doctor_waits: { doctor_name: string; patients: number; avg_wait_minutes: number | null }[];
  ai_accuracy: {
    measured: number; maeMinutes: number | null; within5Pct: number | null;
    totalPredictions: number; avgLatencyMs: number | null; within3sPct: number | null;
    activeModel: { version: string; trainedAt: string; testMae: number | null; trainingSamples: number } | null;
  };
}

interface TrainResult {
  saved: boolean; activated: boolean; reason: string; samples_used: number;
  test: { n: number; mae: number; rmse: number; within5Pct: number };
  baseline_test: { mae: number };
}

const minutes = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v} min`);

export default function AdminAnalyticsPage() {
  const { apiFetch } = useApi();
  const [data, setData] = useState<Analytics | null>(null);
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [trainResult, setTrainResult] = useState<TrainResult | null>(null);
  const [trainError, setTrainError] = useState('');

  const load = useCallback(async () => {
    const r = await apiFetch(`/api/admin/analytics?period=${period}`);
    if (r.ok) { const d = await r.json(); setData(d.data); }
    setLoading(false);
  }, [period, apiFetch]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  async function trainModel() {
    setTraining(true); setTrainError(''); setTrainResult(null);
    try {
      const r = await apiFetch('/api/ai/train-wait-model', { method: 'POST' });
      const d = await r.json();
      if (r.ok) { setTrainResult(d.data); load(); } else { setTrainError(d.error ?? 'Training failed'); }
    } catch {
      setTrainError('Network error. Please try again.');
    } finally {
      setTraining(false);
    }
  }

  const totalApts = data?.appointments.reduce((s, a) => s + Number(a.count), 0) ?? 0;
  const completedApts = Number(data?.appointments.find((a) => a.status === 'Completed')?.count ?? 0);
  const noShowPct = data?.no_show_rate.total
    ? ((data.no_show_rate.no_shows / data.no_show_rate.total) * 100).toFixed(1)
    : '0';

  return (
    <div>
      <Header title="Analytics" subtitle="Detailed system performance and operational metrics" />
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-end">
          <Select label="" value={period}
            onChange={(e) => setPeriod(e.target.value)}
            options={[{ value: 'day', label: 'Today' }, { value: 'week', label: 'This Week' }, { value: 'month', label: 'This Month' }]}
            className="w-40" />
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><span className="animate-spin text-4xl">⏳</span></div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total Appointments" value={totalApts} icon="📅" color="blue" />
              <StatCard label="Completed" value={completedApts} icon="✅" color="green" sub={`${totalApts > 0 ? ((completedApts / totalApts) * 100).toFixed(0) : 0}% completion`} />
              <StatCard label="No-Show Rate" value={`${noShowPct}%`} icon="⚠️" color="red" sub={`${data?.no_show_rate.no_shows ?? 0} no-shows`} />
              <StatCard label="Revenue" value={`R${Number(data?.revenue.total_revenue ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`} icon="💰" color="purple" sub={`Avg R${Number(data?.revenue.avg_fee ?? 0).toFixed(2)}/visit`} />
            </div>

            {/* Waiting times & patient numbers (FR06) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Avg Waiting Time" value={minutes(data?.waiting_times.avg_wait_minutes)} icon="⏱" color="navy"
                sub={`${data?.waiting_times.samples ?? 0} consultations measured`} />
              <StatCard label="Longest Wait" value={minutes(data?.waiting_times.max_wait_minutes)} icon="🐢" color="yellow" />
              <StatCard label="Avg Consultation" value={minutes(data?.waiting_times.avg_consultation_minutes)} icon="🩺" color="blue" />
              <StatCard label="Patients Seen" value={data?.patients.unique_patients ?? 0} icon="👥" color="green"
                sub={`${data?.patients.visits ?? 0} visits`} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Queue Status — Today" subtitle="Live snapshot of every doctor's queue">
                <div className="grid grid-cols-3 gap-3 text-center">
                  {(['Waiting', 'In-Progress', 'Completed', 'Referred', 'No-Show', 'Skipped'] as const).map((s) => (
                    <div key={s} className="rounded-xl bg-gray-50 p-3">
                      <p className="text-2xl font-extrabold text-[#0D1F3C]">{data?.live_queue[s] ?? 0}</p>
                      <p className="text-xs text-gray-500">{s}</p>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="Triage Mix" subtitle="Patients by priority in this period, with average wait">
                {data?.triage_mix.length ? (
                  <div className="space-y-2">
                    {['Red', 'Orange', 'Yellow', 'Green', 'Untriaged'].map((cat) => {
                      const row = data.triage_mix.find((t) => t.category === cat);
                      if (!row) return null;
                      return (
                        <div key={cat} className="flex items-center justify-between text-sm">
                          <TriageBadge category={cat === 'Untriaged' ? null : (cat as TriageCategory)} />
                          <span className="text-gray-600">{row.count} {row.count === 1 ? 'patient' : 'patients'} · avg wait {minutes(row.avg_wait_minutes)}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="py-4 text-center text-sm text-gray-400">No queue activity in this period.</p>}
              </Card>
            </div>

            {/* AI wait-time model (FR03 / T01 / T02) */}
            <Card
              title="AI Wait-Time Prediction"
              subtitle="Accuracy of predictions against the waits patients actually experienced (last 30 days)"
              action={<Button size="sm" variant="blue" loading={training} onClick={trainModel}>Train model now</Button>}
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Mean absolute error</p>
                  <p className="text-xl font-extrabold text-[#0D1F3C]">{minutes(data?.ai_accuracy.maeMinutes)}</p>
                  <p className="text-[11px] text-gray-400">target ≤ 5 min · {data?.ai_accuracy.measured ?? 0} measured</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Within ±5 minutes</p>
                  <p className="text-xl font-extrabold text-[#0D1F3C]">{data?.ai_accuracy.within5Pct != null ? `${data.ai_accuracy.within5Pct}%` : '—'}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Predicted within 3 s</p>
                  <p className="text-xl font-extrabold text-[#0D1F3C]">{data?.ai_accuracy.within3sPct != null ? `${data.ai_accuracy.within3sPct}%` : '—'}</p>
                  <p className="text-[11px] text-gray-400">target ≥ 95% · avg {data?.ai_accuracy.avgLatencyMs ?? '—'} ms</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Active model</p>
                  <p className="truncate text-sm font-bold text-[#0D1F3C]">{data?.ai_accuracy.activeModel?.version ?? 'Queueing formula'}</p>
                  <p className="text-[11px] text-gray-400">
                    {data?.ai_accuracy.activeModel ? `${data.ai_accuracy.activeModel.trainingSamples} consultations` : 'no trained model yet'}
                  </p>
                </div>
              </div>

              {trainError && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{trainError}</div>}
              {trainResult && (
                <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${trainResult.activated ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                  <p className="font-semibold">{trainResult.activated ? 'New model activated' : 'Model not activated'}</p>
                  <p>{trainResult.reason}</p>
                  {trainResult.test.n > 0 && (
                    <p className="mt-1 text-xs">
                      Hold-out ({trainResult.test.n} consultations): MAE {trainResult.test.mae} min · RMSE {trainResult.test.rmse} ·
                      {' '}{trainResult.test.within5Pct}% within ±5 min · baseline MAE {trainResult.baseline_test.mae} min
                    </p>
                  )}
                </div>
              )}
            </Card>

            {data && data.doctor_waits.length > 0 && (
              <Card title="Waiting Time by Doctor" subtitle="Longest average wait first">
                <div className="space-y-2">
                  {data.doctor_waits.map((d) => (
                    <div key={d.doctor_name} className="flex items-center justify-between border-b border-gray-50 py-1.5 text-sm last:border-0">
                      <span className="font-medium text-gray-800">{d.doctor_name}</span>
                      <span className="text-gray-600">{minutes(d.avg_wait_minutes)} <span className="text-gray-400">· {d.patients} {d.patients === 1 ? 'patient' : 'patients'}</span></span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Appointment Status Breakdown */}
              <Card title="Appointments by Status">
                <div className="space-y-3">
                  {data?.appointments.map((a) => {
                    const pct = totalApts > 0 ? (Number(a.count) / totalApts) * 100 : 0;
                    const colors: Record<string, string> = {
                      Scheduled: 'bg-blue-500', Confirmed: 'bg-green-500',
                      Completed: 'bg-gray-400', Cancelled: 'bg-red-400',
                      'In-Progress': 'bg-orange-500', 'No-Show': 'bg-red-600',
                      Referred: 'bg-purple-500',
                    };
                    return (
                      <div key={a.status}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700">{a.status}</span>
                          <span className="font-medium">{a.count} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100">
                          <div className={`h-2 rounded-full ${colors[a.status] ?? 'bg-gray-400'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Top Specializations */}
              <Card title="Top Specializations">
                <div className="space-y-2">
                  {data?.top_specializations.map((s, i) => (
                    <div key={s.name} className="flex items-center gap-3">
                      <span className="text-sm text-gray-400 w-5">{i + 1}.</span>
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700">{s.name}</span>
                          <span className="font-medium">{s.booking_count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-100">
                          <div className="h-1.5 rounded-full bg-blue-500"
                            style={{ width: `${(s.booking_count / (data.top_specializations[0]?.booking_count || 1)) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Doctor Performance */}
            <Card title="Doctor Performance">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase text-gray-500">
                      <th className="pb-3 pr-4">Doctor</th>
                      <th className="pb-3 pr-4">Appointments</th>
                      <th className="pb-3 pr-4">No-Shows</th>
                      <th className="pb-3 pr-4">Rating</th>
                      <th className="pb-3">Reviews</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data?.doctor_performance.map((d) => (
                      <tr key={d.doctor_name} className="hover:bg-gray-50">
                        <td className="py-3 pr-4 font-medium">{d.doctor_name}</td>
                        <td className="py-3 pr-4 text-gray-600">{d.total_appointments}</td>
                        <td className="py-3 pr-4">
                          <span className={d.no_shows > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}>{d.no_shows}</span>
                        </td>
                        <td className="py-3 pr-4">
                          <span className="text-yellow-600">⭐</span> {Number(d.average_rating).toFixed(1)}
                        </td>
                        <td className="py-3 text-gray-500">{d.total_reviews}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Facility Popularity */}
            <Card title="Facility Popularity">
              <div className="space-y-2">
                {data?.facility_popularity.map((f) => (
                  <div key={`${f.facility_type}-${f.facility_name}`} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 text-sm">
                    <div>
                      <span className="font-medium text-gray-800">{f.facility_name || 'Unknown'}</span>
                      <span className="ml-2 text-xs text-gray-400">{f.facility_type}</span>
                    </div>
                    <span className="font-medium">{f.appointment_count} bookings</span>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
