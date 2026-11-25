'use client';

import { useEffect, useRef, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TriageBadge } from './TriageBadge';
import { DISCRIMINATORS, TRIAGE_CATEGORIES, TRIAGE_META, type Avpu, type Mobility, type TriageSuggestion } from '@/lib/triage';
import type { QueueEntry, TriageCategory } from '@/types';

interface Props {
  open: boolean;
  /** Mount with `key={entry.id}` (or only while an entry is selected) so the form starts blank per patient. */
  entry: QueueEntry | null;
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY_VITALS = { rr: '', hr: '', sbp: '', temp: '', spo2: '', glucose: '' };

const CATEGORY_BUTTON: Record<TriageCategory, string> = {
  Red: 'border-red-600 bg-red-600 text-white',
  Orange: 'border-orange-500 bg-orange-500 text-white',
  Yellow: 'border-yellow-400 bg-yellow-300 text-yellow-900',
  Green: 'border-green-500 bg-green-500 text-white',
};

const GROUPS: { category: TriageCategory; title: string }[] = [
  { category: 'Red', title: 'Emergency signs' },
  { category: 'Orange', title: 'Very urgent signs' },
  { category: 'Yellow', title: 'Urgent signs' },
];

export function TriageModal({ open, entry, onClose, onSaved }: Props) {
  const { apiFetch } = useApi();

  const [vitals, setVitals] = useState(EMPTY_VITALS);
  const [avpu, setAvpu] = useState<Avpu | ''>('');
  const [mobility, setMobility] = useState<Mobility | ''>('');
  const [trauma, setTrauma] = useState(false);
  const [discriminators, setDiscriminators] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  const [suggestion, setSuggestion] = useState<TriageSuggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [chosen, setChosen] = useState<TriageCategory | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const userPicked = useRef(false);
  const requestSeq = useRef(0);

  // Callers mount this component only while a patient is selected, so every
  // assessment starts from a blank form without any reset logic.

  function payload() {
    const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
    return {
      queue_id: entry!.id,
      vitals: {
        respiratoryRate: num(vitals.rr), heartRate: num(vitals.hr), systolicBp: num(vitals.sbp),
        temperatureC: num(vitals.temp), spo2: num(vitals.spo2), glucoseMmol: num(vitals.glucose),
      },
      avpu: avpu || undefined,
      mobility: mobility || undefined,
      trauma,
      discriminators,
    };
  }

  // Live AI suggestion, debounced while the nurse types.
  useEffect(() => {
    if (!open || !entry) return;
    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      setSuggesting(true);
      try {
        const res = await apiFetch('/api/triage/suggest', { method: 'POST', body: JSON.stringify(payload()) });
        if (seq !== requestSeq.current) return; // a newer request superseded this one
        if (res.ok) {
          const d = await res.json();
          const s: TriageSuggestion = d.data.suggestion;
          setSuggestion(s);
          if (!userPicked.current) setChosen(s.category);
        }
      } finally {
        if (seq === requestSeq.current) setSuggesting(false);
      }
    }, 400);
    return () => clearTimeout(timer);
    // payload() reads the same state listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry?.id, vitals, avpu, mobility, trauma, discriminators]);

  function toggleDiscriminator(id: string) {
    setDiscriminators((cur) => (cur.includes(id) ? cur.filter((d) => d !== id) : [...cur, id]));
  }

  const overriding = !!(suggestion?.category && chosen && suggestion.category !== chosen);

  async function save() {
    if (!entry || !chosen) return;
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch('/api/triage', {
        method: 'POST',
        body: JSON.stringify({ ...payload(), category: chosen, notes: notes.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.data?.[0]?.message ?? d.error ?? 'Could not save triage');
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const vitalField = (key: keyof typeof EMPTY_VITALS, label: string, step = '1') => (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-gray-600">{label}</span>
      <input
        type="number" step={step} inputMode="decimal" value={vitals[key]}
        onChange={(e) => setVitals((v) => ({ ...v, [key]: e.target.value }))}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#2346E8] focus:ring-2 focus:ring-[#2346E8]/20"
      />
    </label>
  );

  const selectClass = 'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#2346E8]';

  return (
    <Modal open={open} onClose={onClose} title={entry ? `Triage — ${entry.patient_name}` : 'Triage'} size="xl">
      <div className="max-h-[72vh] space-y-5 overflow-y-auto pr-1">
        {/* Vitals */}
        <section>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Vital signs</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {vitalField('rr', 'Respiratory rate (/min)')}
            {vitalField('hr', 'Heart rate (bpm)')}
            {vitalField('sbp', 'Systolic BP (mmHg)')}
            {vitalField('temp', 'Temperature (°C)', '0.1')}
            {vitalField('spo2', 'SpO₂ (%)')}
            {vitalField('glucose', 'Glucose (mmol/L)', '0.1')}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-600">Consciousness (AVPU)</span>
              <select value={avpu} onChange={(e) => setAvpu(e.target.value as Avpu | '')} className={selectClass}>
                <option value="">Not assessed</option>
                <option value="Alert">Alert</option>
                <option value="Voice">Responds to voice</option>
                <option value="Pain">Responds to pain</option>
                <option value="Unresponsive">Unresponsive</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-600">Mobility</span>
              <select value={mobility} onChange={(e) => setMobility(e.target.value as Mobility | '')} className={selectClass}>
                <option value="">Not assessed</option>
                <option value="Walking">Walking</option>
                <option value="WithHelp">Walking with help</option>
                <option value="Stretcher">Stretcher / immobile</option>
              </select>
            </label>
            <label className="flex items-end gap-2 pb-2">
              <input type="checkbox" checked={trauma} onChange={(e) => setTrauma(e.target.checked)} className="h-4 w-4 rounded" />
              <span className="text-sm text-gray-700">Trauma / injury</span>
            </label>
          </div>
        </section>

        {/* Discriminators */}
        <section>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Clinical signs present</p>
          <div className="space-y-3">
            {GROUPS.map((g) => (
              <div key={g.category}>
                <p className="mb-1 flex items-center gap-2 text-xs font-semibold text-gray-600">
                  <TriageBadge category={g.category} compact /> {g.title}
                </p>
                <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                  {DISCRIMINATORS.filter((d) => d.category === g.category).map((d) => (
                    <label key={d.id} className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={discriminators.includes(d.id)} onChange={() => toggleDiscriminator(d.id)} className="h-4 w-4 rounded" />
                      {d.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* AI suggestion */}
        <section className="rounded-xl border border-[#2346E8]/20 bg-[#EEF2FF] p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-[#2346E8]">AI-assisted suggestion</p>
            {suggesting && <span className="text-xs text-gray-500">Calculating…</span>}
          </div>
          {suggestion ? (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <TriageBadge category={suggestion.category} />
                {suggestion.tewsScore !== null && (
                  <span className="text-sm text-gray-700">TEWS <strong>{suggestion.tewsScore}</strong></span>
                )}
                <span className="text-xs text-gray-500">confidence: {suggestion.confidence}</span>
                {suggestion.targetMinutes !== null && (
                  <span className="text-xs text-gray-500">
                    target: {suggestion.targetMinutes === 0 ? 'immediate' : `within ${suggestion.targetMinutes} min`}
                  </span>
                )}
              </div>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-gray-600">
                {suggestion.rationale.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
              {suggestion.requiresManual && (
                <p className="text-xs font-medium text-amber-700">
                  This case needs your clinical judgement — please choose the category yourself.
                </p>
              )}
              {suggestion.missing.length > 0 && (
                <p className="text-xs text-gray-500">Not recorded: {suggestion.missing.join(', ')}</p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-xs text-gray-500">Enter vital signs or select clinical signs to get a suggestion.</p>
          )}
          <p className="mt-2 text-[11px] text-gray-400">
            Decision support only (SATS / TEWS). You are responsible for the final triage category.
          </p>
        </section>

        {/* Decision */}
        <section>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Triage category</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TRIAGE_CATEGORIES.map((c) => (
              <button
                key={c} type="button"
                onClick={() => { userPicked.current = true; setChosen(c); }}
                className={`rounded-xl border-2 px-3 py-2.5 text-left text-sm font-bold transition-all
                  ${chosen === c ? `${CATEGORY_BUTTON[c]} shadow-md` : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
              >
                {c}
                <span className="block text-[11px] font-medium opacity-80">{TRIAGE_META[c].label}</span>
              </button>
            ))}
          </div>

          {overriding && (
            <p className="mt-2 text-xs font-medium text-amber-700">
              You are overriding the suggested {suggestion?.category}. Please note why below.
            </p>
          )}
          <label className="mt-3 flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-600">
              Notes {overriding ? <span className="text-red-500">*</span> : <span className="font-normal text-gray-400">(optional)</span>}
            </span>
            <textarea
              value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#2346E8] focus:ring-2 focus:ring-[#2346E8]/20"
            />
          </label>
        </section>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={saving} disabled={!chosen || (overriding && !notes.trim())} onClick={save}>
            {chosen ? `Confirm ${chosen}` : 'Choose a category'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
