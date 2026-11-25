'use client';

import { useEffect, useRef, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { EmergencyFollowUp } from '@/components/appointments/EmergencyFollowUp';
import Link from 'next/link';
import type { Hospital, Symptom } from '@/types';

interface SelectedSymptom { symptom_id: number; name: string; severity: 'Mild' | 'Moderate' | 'Severe'; duration_days: number }
interface AIResult { suggested_specialization: string; urgency: string; severity_score: number; recommended_doctors: Record<string, unknown>[]; disclaimer: string }

interface EmergencyResult {
  emergency: boolean;
  doctorAvailable?: boolean;
  unavailable?: boolean;
  category: 'Red' | 'Orange' | 'Yellow' | 'Green' | null;
  message: string;
  disclaimer: string;
  doctorName?: string;
  appointmentId?: number;
}

function EmergencyPreCheck() {
  const { apiFetch } = useApi();
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [hospitalId, setHospitalId] = useState('');
  const [description, setDescription] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<EmergencyResult | null>(null);
  const [error, setError] = useState('');
  const [emergencyFollowupId, setEmergencyFollowupId] = useState<number | null>(null);

  useEffect(() => {
    apiFetch('/api/hospitals?limit=100').then(async (r) => {
      if (r.ok) { const d = await r.json(); setHospitals(d.data ?? []); }
    }).catch(() => {});
  }, [apiFetch]);

  async function runCheck() {
    if (!hospitalId || description.trim().length < 10) return;
    setChecking(true);
    setError('');
    setResult(null);
    try {
      const res = await apiFetch('/api/ai/emergency-check', {
        method: 'POST',
        body: JSON.stringify({ hospital_id: Number(hospitalId), description: description.trim() }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.data?.[0]?.message ?? d.error ?? 'Could not run the check'); return; }
      setResult(d.data);
      if (d.data.emergency && d.data.doctorAvailable && d.data.appointmentId) {
        setEmergencyFollowupId(d.data.appointmentId);
      }
    } catch {
      setError('Network error. If this may be an emergency, please call emergency services or go to your nearest Emergency Department now.');
    } finally {
      setChecking(false);
    }
  }

  const banner = result && (
    result.emergency && result.doctorAvailable
      ? { style: 'border-red-300 bg-red-50 text-red-900', icon: '🚨' }
      : result.emergency
        ? { style: 'border-red-400 bg-red-100 text-red-950', icon: '🚑' }
        : result.unavailable
          ? { style: 'border-amber-300 bg-amber-50 text-amber-900', icon: '⚠️' }
          : { style: 'border-emerald-300 bg-emerald-50 text-emerald-900', icon: '✅' }
  );

  return (
    <Card title="🚨 Emergency Pre-Check" subtitle="Describe what's happening — an AI check will flag if you need to go straight to a doctor">
      <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        If this is a life-threatening emergency (e.g. chest pain, can&apos;t breathe, severe bleeding, unconscious),
        <strong> call emergency services (10177 / 112) or go to your nearest Emergency Department now</strong> — don&apos;t wait for this tool.
      </div>

      <div className="space-y-4">
        <Select
          label="Which hospital are you nearest to?"
          value={hospitalId}
          onChange={(e) => setHospitalId(e.target.value)}
          placeholder="Select a hospital"
          options={hospitals.map((h) => ({ value: h.id, label: `${h.name} — ${h.city}` }))}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-[#0D1F3C]/80">Describe what&apos;s happening, in your own words</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="e.g. I have sudden chest pain and I'm finding it hard to breathe..."
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-[#2346E8] focus:ring-2 focus:ring-[#2346E8]/20"
          />
        </label>
        <Button onClick={runCheck} loading={checking} disabled={!hospitalId || description.trim().length < 10}>
          🤖 Check Now
        </Button>
      </div>

      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {result && banner && (
        <div className={`mt-4 space-y-2 rounded-xl border p-4 ${banner.style}`}>
          <p className="font-bold">{banner.icon} {result.message}</p>
          {result.emergency && result.doctorAvailable && (
            <Link href="/patient/queue" className="inline-block text-sm font-semibold underline">View my queue position →</Link>
          )}
          {!result.emergency && !result.unavailable && (
            <Link href="/patient/book" className="inline-block text-sm font-semibold underline">Continue to book a routine appointment →</Link>
          )}
          <p className="text-xs opacity-75">{result.disclaimer}</p>
        </div>
      )}
      {emergencyFollowupId !== null && (
        <EmergencyFollowUp
          appointmentId={emergencyFollowupId}
          initiallyUnanswered
          onClose={() => setEmergencyFollowupId(null)}
        />
      )}
    </Card>
  );
}

export default function SymptomCheckerPage() {
  const { apiFetch } = useApi();
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  // Distinguishes "haven't searched yet" from "searched and found nothing" — without this the
  // box gives no feedback at all when a typed symptom genuinely isn't in the list.
  const [searched, setSearched] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [selected, setSelected] = useState<SelectedSymptom[]>([]);
  const [result, setResult] = useState<AIResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkError, setCheckError] = useState('');
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (search.length < 2) { setSymptoms([]); setSearched(false); setSearchFailed(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/symptoms?search=${encodeURIComponent(search)}`);
        if (res.ok) {
          const d = await res.json();
          setSymptoms(d.data ?? []);
          setSearchFailed(false);
        } else {
          setSymptoms([]);
          setSearchFailed(true);
        }
      } catch {
        setSymptoms([]);
        setSearchFailed(true);
      } finally {
        setSearched(true);
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [search, apiFetch]);

  function addSymptom(s: Symptom) {
    if (selected.find((x) => x.symptom_id === s.id)) return;
    setSelected((prev) => [...prev, { symptom_id: s.id, name: s.name, severity: 'Mild', duration_days: 1 }]);
    setSearch('');
    setSymptoms([]);
  }

  function removeSymptom(id: number) {
    setSelected((prev) => prev.filter((s) => s.symptom_id !== id));
  }

  function updateSymptom(id: number, field: 'severity' | 'duration_days', value: string | number) {
    setSelected((prev) => prev.map((s) => s.symptom_id === id ? { ...s, [field]: value } : s));
  }

  async function checkSymptoms() {
    if (!selected.length) return;
    setLoading(true);
    setResult(null);
    setCheckError('');
    try {
      const res = await apiFetch('/api/ai/symptom-check', {
        method: 'POST',
        body: JSON.stringify({ symptoms: selected }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setCheckError(d?.data?.[0]?.message ?? d?.error ?? 'Could not check symptoms. Please try again.');
        return;
      }
      setResult(d.data);
      // A fast, successful check can otherwise look like nothing happened if the result
      // renders below the fold — scroll it into view so pressing the button always shows something.
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch {
      setCheckError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Header title="Symptom Checker" subtitle="AI-assisted — not a substitute for professional medical advice" />
      <div className="p-8 space-y-6">
        <EmergencyPreCheck />

        <Card title="Add Your Symptoms" subtitle="Not an emergency? Check individual symptoms for a specialist recommendation">
          <div className="relative">
            <Input
              label="Search symptoms"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type a symptom e.g. headache, fever, chest pain..."
            />
            {search.length >= 2 && (searching || searched) && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
                {searching ? (
                  <p className="px-4 py-3 text-sm text-gray-400">Searching…</p>
                ) : searchFailed ? (
                  <p className="px-4 py-3 text-sm text-red-500">Could not search symptoms right now. Please try again.</p>
                ) : symptoms.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-500">
                    No matching symptoms. Try: headache, fever, cough, chest pain, nausea…
                  </p>
                ) : (
                  symptoms.slice(0, 8).map((s) => (
                    <button key={s.id} onClick={() => addSymptom(s)}
                      className="flex w-full items-start gap-3 px-4 py-2 text-left hover:bg-gray-50">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{s.name}</p>
                        {s.description && <p className="text-xs text-gray-500">{s.description}</p>}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {selected.length > 0 && (
            <div className="mt-4 space-y-3">
              {selected.map((s) => (
                <div key={s.symptom_id} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{s.name}</p>
                    <div className="mt-2 flex gap-3">
                      <Select
                        label=""
                        value={s.severity}
                        onChange={(e) => updateSymptom(s.symptom_id, 'severity', e.target.value)}
                        options={[
                          { value: 'Mild', label: 'Mild' },
                          { value: 'Moderate', label: 'Moderate' },
                          { value: 'Severe', label: 'Severe' },
                        ]}
                        className="w-36"
                      />
                      <Input
                        label=""
                        type="number"
                        value={s.duration_days}
                        onChange={(e) => updateSymptom(s.symptom_id, 'duration_days', Number(e.target.value))}
                        hint="days"
                        min={1}
                        className="w-24"
                      />
                    </div>
                  </div>
                  <button onClick={() => removeSymptom(s.symptom_id)} className="text-red-400 hover:text-red-600 text-xl">×</button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4">
            <Button onClick={checkSymptoms} loading={loading} disabled={selected.length === 0}>
              🤖 Check Symptoms
            </Button>
          </div>

          {checkError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{checkError}</div>
          )}
        </Card>

        {result && (
          <div ref={resultRef} className="scroll-mt-6">
          <Card title="AI Assessment">
            <div className="space-y-4">
              <div className={`rounded-lg p-4 ${result.urgency === 'Urgent' ? 'bg-red-50 border border-red-200' : result.urgency === 'Soon' ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
                <p className="font-semibold text-gray-900">Urgency: {result.urgency}</p>
                <p className="text-sm text-gray-600">Severity score: {result.severity_score}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700">Suggested Specialization:</p>
                <p className="text-lg font-bold text-blue-700">{result.suggested_specialization}</p>
              </div>

              {result.recommended_doctors.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Recommended Doctors:</p>
                  <div className="space-y-2">
                    {result.recommended_doctors.map((doc: Record<string, unknown>) => (
                      <div key={String(doc.id)} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                        <div>
                          <p className="text-sm font-medium">{String(doc.name)}</p>
                          <p className="text-xs text-gray-500">⭐ {Number(doc.average_rating).toFixed(1)}</p>
                        </div>
                        <Link href="/patient/book">
                          <Button size="sm">Book</Button>
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">{result.disclaimer}</p>
            </div>
          </Card>
          </div>
        )}
      </div>
    </div>
  );
}
