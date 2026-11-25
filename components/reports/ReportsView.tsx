'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

interface Column { key: string; label: string }
type Row = Record<string, string | number | null>;

interface Report {
  type: string;
  title: string;
  from: string;
  to: string;
  generated_at: string;
  columns: Column[];
  summary: Row;
  rows: Row[];
  by_doctor: Row[];
}

const REPORT_TYPES = [
  { value: 'waiting-times', label: 'Patient waiting times' },
  { value: 'appointments', label: 'Appointments' },
  { value: 'queue-performance', label: 'Queue performance' },
];

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const cell = (v: string | number | null | undefined) => (v === null || v === undefined ? '—' : v);

function toCsv(report: Report): string {
  const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const section = (first: string, rows: Row[], key: 'date' | 'doctor') => [
    [first, ...report.columns.map((c) => c.label)].map(esc).join(','),
    ...rows.map((r) => [r[key], ...report.columns.map((c) => r[c.key])].map(esc).join(',')),
  ];
  return [
    esc(`${report.title}: ${report.from} to ${report.to}`),
    '',
    ...section('Date', report.rows, 'date'),
    '',
    ['Total', ...report.columns.map((c) => report.summary[c.key])].map(esc).join(','),
    '',
    ...section('Doctor', report.by_doctor, 'doctor'),
  ].join('\n');
}

/**
 * Report generator for a selected period (FR08). Admins can report on all doctors or one;
 * the API restricts doctors to their own figures regardless of what is sent.
 */
export function ReportsView({ title, subtitle, showDoctorFilter }: { title: string; subtitle: string; showDoctorFilter: boolean }) {
  const { apiFetch } = useApi();
  const [type, setType] = useState('waiting-times');
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return isoDate(d); });
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [doctorId, setDoctorId] = useState('');
  const [doctors, setDoctors] = useState<{ doctor_id: number; full_name: string }[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!showDoctorFilter) return;
    apiFetch('/api/doctors?limit=100').then(async (r) => {
      if (r.ok) { const d = await r.json(); setDoctors(d.data ?? []); }
    }).catch(() => {});
  }, [showDoctorFilter, apiFetch]);

  async function generate() {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ type, from, to });
      if (doctorId) params.set('doctor_id', doctorId);
      const res = await apiFetch(`/api/reports?${params}`);
      const d = await res.json();
      if (!res.ok) { setError(d.data?.[0]?.message ?? d.error ?? 'Could not generate the report'); setReport(null); }
      else setReport(d.data);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function download() {
    if (!report) return;
    const blob = new Blob([toCsv(report)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.type}_${report.from}_to_${report.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const table = (first: string, key: 'date' | 'doctor', rows: Row[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase text-gray-500">
            <th className="pb-3 pr-4">{first}</th>
            {report!.columns.map((c) => <th key={c.key} className="pb-3 pr-4 text-right">{c.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((r) => (
            <tr key={String(r[key])} className="hover:bg-gray-50">
              <td className="py-2.5 pr-4 font-medium text-gray-800">{cell(r[key])}</td>
              {report!.columns.map((c) => <td key={c.key} className="py-2.5 pr-4 text-right text-gray-600">{cell(r[c.key])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <Header title={title} subtitle={subtitle} />
      <div className="space-y-6 p-8">
        <div className="flex flex-wrap items-end gap-4 print:hidden">
          <Select label="Report" value={type} onChange={(e) => setType(e.target.value)} options={REPORT_TYPES} className="w-56" />
          <Input label="From" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-44" />
          <Input label="To" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-44" />
          {showDoctorFilter && (
            <Select
              label="Doctor" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="w-56"
              placeholder="All doctors" options={doctors.map((d) => ({ value: d.doctor_id, label: d.full_name }))}
            />
          )}
          <Button variant="blue" loading={loading} onClick={generate}>Generate report</Button>
          {report && (
            <>
              <Button variant="ghost" onClick={download}>⬇ Export CSV</Button>
              <Button variant="ghost" onClick={() => window.print()}>🖨 Print</Button>
            </>
          )}
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {!report && !error && !loading && (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center text-gray-500">
            Choose a report and period, then press <strong>Generate report</strong>.
          </div>
        )}

        {report && (
          <>
            <div>
              <h2 className="text-lg font-bold text-[#0D1F3C]">{report.title}</h2>
              <p className="text-sm text-gray-500">
                {report.from} to {report.to} · generated {new Date(report.generated_at).toLocaleString('en-ZA')}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {report.columns.map((c) => (
                <div key={c.key} className="rounded-xl border border-gray-100 bg-white p-4">
                  <p className="text-xs text-gray-500">{c.label}</p>
                  <p className="text-2xl font-extrabold text-[#0D1F3C]">{cell(report.summary[c.key] ?? 0)}</p>
                </div>
              ))}
            </div>

            <Card title="By day">
              {report.rows.length ? table('Date', 'date', report.rows) : <p className="py-6 text-center text-sm text-gray-400">No data for this period.</p>}
            </Card>
            {report.by_doctor.length > 0 && <Card title="By doctor">{table('Doctor', 'doctor', report.by_doctor)}</Card>}
          </>
        )}
      </div>
    </div>
  );
}
