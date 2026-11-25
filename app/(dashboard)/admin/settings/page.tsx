'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

interface SettingRow {
  key: string;
  label: string;
  description: string;
  type: 'boolean' | 'number' | 'hours-list';
  min?: number;
  max?: number;
  value: string;
}

interface ReminderStatus {
  enabled: boolean;
  lead_hours: number[];
  sms_configured: boolean;
  last_30_days: Record<string, number>;
  recent: { id: number; appointment_id: number; lead_hours: number; status: string; attempts: number; error: string | null; patient_name: string; appointment_datetime: string }[];
}

interface RunResult { enabled: boolean; smsConfigured: boolean; sent: number; failed: number; skipped: number; retried: number; emailSent: number; emailFailed: number }

const STATUS_COLOR: Record<string, 'green' | 'red' | 'gray' | 'yellow'> = { Sent: 'green', Failed: 'red', Skipped: 'gray', Pending: 'yellow' };

export default function AdminSettingsPage() {
  const { apiFetch } = useApi();
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [reminders, setReminders] = useState<ReminderStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);

  const loadReminders = useCallback(async () => {
    const r = await apiFetch('/api/admin/reminders');
    if (r.ok) { const d = await r.json(); setReminders(d.data); }
  }, [apiFetch]);

  // `apiFetch` changes identity once when the session finishes restoring, which re-runs this effect.
  // The form is seeded only once, so a late second load can never overwrite what the admin has typed.
  const seeded = useRef(false);

  useEffect(() => {
    apiFetch('/api/admin/settings').then(async (r) => {
      if (r.ok && !seeded.current) {
        seeded.current = true;
        const d = await r.json();
        const list: SettingRow[] = d.data ?? [];
        setRows(list);
        setValues(Object.fromEntries(list.map((s) => [s.key, s.value])));
      }
      setLoading(false);
    });
    loadReminders();
  }, [apiFetch, loadReminders]);

  const dirty = rows.some((s) => values[s.key] !== s.value);

  async function save() {
    setSaving(true); setMessage(''); setError('');
    try {
      const changed = Object.fromEntries(rows.filter((s) => values[s.key] !== s.value).map((s) => [s.key, values[s.key]]));
      const res = await apiFetch('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ settings: changed }) });
      const d = await res.json();
      if (!res.ok) { setError(d.data?.map((i: { message: string }) => i.message).join(' · ') ?? d.error ?? 'Could not save settings'); return; }
      // Adopt the normalised values the server stored (e.g. "2, 24" → "24,2").
      const saved: Record<string, string> = d.data ?? {};
      setRows((cur) => cur.map((s) => (s.key in saved ? { ...s, value: saved[s.key] } : s)));
      setValues((cur) => ({ ...cur, ...saved }));
      setMessage('Settings saved.');
      loadReminders();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function runReminders() {
    setRunning(true); setRunResult(null);
    try {
      const r = await apiFetch('/api/admin/reminders', { method: 'POST' });
      if (r.ok) { const d = await r.json(); setRunResult(d.data); loadReminders(); }
    } finally {
      setRunning(false);
    }
  }

  function field(s: SettingRow) {
    if (s.type === 'boolean') {
      return (
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox" checked={values[s.key] === 'true'} className="h-5 w-5 rounded"
            onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.checked ? 'true' : 'false' }))}
          />
          <span className="text-sm text-gray-700">{values[s.key] === 'true' ? 'On' : 'Off'}</span>
        </label>
      );
    }
    return (
      <Input
        label="" value={values[s.key] ?? ''} className="w-56"
        type={s.type === 'number' ? 'number' : 'text'} min={s.min} max={s.max}
        onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))}
      />
    );
  }

  return (
    <div>
      <Header title="System Settings" subtitle="Configure reminders and AI wait-time prediction" />
      <div className="max-w-4xl space-y-6 p-8">
        <Card
          title="Settings"
          action={<Button loading={saving} disabled={!dirty} onClick={save}>Save changes</Button>}
        >
          {loading ? (
            <div className="flex justify-center py-8"><span className="animate-spin text-3xl">⏳</span></div>
          ) : (
            <div className="divide-y divide-gray-100">
              {rows.map((s) => (
                <div key={s.key} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                  <div className="max-w-md">
                    <p className="text-sm font-semibold text-[#0D1F3C]">{s.label}</p>
                    <p className="text-xs text-gray-500">{s.description}</p>
                  </div>
                  {field(s)}
                </div>
              ))}
            </div>
          )}
          {message && <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{message}</p>}
          {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
        </Card>

        <Card
          title="SMS Reminders"
          subtitle="Sent automatically every 5 minutes for upcoming appointments"
          action={<Button size="sm" variant="blue" loading={running} onClick={runReminders}>Send due reminders now</Button>}
        >
          {reminders && !reminders.sms_configured && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              No SMS provider is configured, so reminders are not being sent. Set <code>AT_API_KEY</code> (Africa&apos;s Talking)
              or <code>SMS_TOKEN_ID</code> / <code>SMS_TOKEN_SECRET</code> (BulkSMS) in <code>.env.local</code> and restart the server.
            </div>
          )}
          {runResult && (
            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              Run complete — SMS: sent {runResult.sent}, failed {runResult.failed}, skipped {runResult.skipped}, retried {runResult.retried}.
              Email: sent {runResult.emailSent}, failed {runResult.emailFailed}.
              {!runResult.enabled && ' Reminders are switched off.'}
            </div>
          )}

          {reminders && (
            <>
              <div className="mb-4 flex flex-wrap gap-3 text-sm">
                <Badge label={reminders.enabled ? 'Enabled' : 'Disabled'} color={reminders.enabled ? 'green' : 'gray'} />
                <span className="text-gray-500">Lead times: {reminders.lead_hours.map((h) => `${h}h`).join(', ')} before</span>
                <span className="text-gray-500">
                  Last 30 days: {Object.entries(reminders.last_30_days).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ') || 'none yet'}
                </span>
              </div>
              {reminders.recent.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase text-gray-500">
                        <th className="pb-2 pr-4">Patient</th><th className="pb-2 pr-4">Appointment</th>
                        <th className="pb-2 pr-4">Lead</th><th className="pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {reminders.recent.map((r) => (
                        <tr key={r.id}>
                          <td className="py-2 pr-4 text-gray-800">{r.patient_name}</td>
                          <td className="py-2 pr-4 text-gray-600">{new Date(r.appointment_datetime).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                          <td className="py-2 pr-4 text-gray-600">{r.lead_hours}h</td>
                          <td className="py-2">
                            <Badge label={r.status} color={STATUS_COLOR[r.status] ?? 'gray'} />
                            {r.error && <span className="ml-2 text-xs text-gray-400">{r.error}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
