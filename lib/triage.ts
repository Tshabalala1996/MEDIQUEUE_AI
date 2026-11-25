/**
 * AI-assisted triage suggestion (FR04 / T03).
 *
 * Implements the adult Triage Early Warning Score (TEWS) used by the South
 * African Triage Scale (SATS) together with clinical "discriminators" that
 * override the score (e.g. a current seizure is always an emergency).
 *
 * This is decision support only. The suggestion is shown to an authorised
 * healthcare worker who confirms or overrides it; the system never assigns a
 * priority on its own. Pure functions — no I/O.
 */

export type TriageCategory = 'Red' | 'Orange' | 'Yellow' | 'Green';

export interface TriageMeta {
  priority: number;
  label: string;
  /** SATS target time to be seen by a clinician. */
  targetMinutes: number;
}

export const TRIAGE_META: Record<TriageCategory, TriageMeta> = {
  Red: { priority: 1, label: 'Emergency', targetMinutes: 0 },
  Orange: { priority: 2, label: 'Very urgent', targetMinutes: 10 },
  Yellow: { priority: 3, label: 'Urgent', targetMinutes: 60 },
  Green: { priority: 4, label: 'Routine', targetMinutes: 240 },
};

export const TRIAGE_CATEGORIES: TriageCategory[] = ['Red', 'Orange', 'Yellow', 'Green'];

export function categoryFromPriority(priority: number): TriageCategory | null {
  return TRIAGE_CATEGORIES.find((c) => TRIAGE_META[c].priority === priority) ?? null;
}

// ─── Clinical discriminators ─────────────────────────────────────────────────

export interface Discriminator {
  id: string;
  label: string;
  category: TriageCategory;
}

export const DISCRIMINATORS: Discriminator[] = [
  // Emergency
  { id: 'airway_compromised', label: 'Airway compromised / not breathing', category: 'Red' },
  { id: 'seizure_current', label: 'Seizure — current', category: 'Red' },
  { id: 'burn_facial_inhalation', label: 'Burn — facial / inhalation', category: 'Red' },
  { id: 'cardiac_arrest', label: 'Cardiac arrest', category: 'Red' },
  { id: 'major_haemorrhage', label: 'Uncontrolled major haemorrhage', category: 'Red' },
  // Very urgent
  { id: 'chest_pain', label: 'Chest pain', category: 'Orange' },
  { id: 'coughing_blood', label: 'Coughing blood', category: 'Orange' },
  { id: 'focal_neurology', label: 'Acute focal neurology (stroke signs)', category: 'Orange' },
  { id: 'reduced_consciousness', label: 'Reduced level of consciousness', category: 'Orange' },
  { id: 'overdose_poisoning', label: 'Overdose / poisoning', category: 'Orange' },
  { id: 'severe_pain', label: 'Very severe pain', category: 'Orange' },
  { id: 'pregnancy_abdominal_pain', label: 'Pregnancy with abdominal pain / trauma', category: 'Orange' },
  { id: 'seizure_postictal', label: 'Seizure — post-ictal', category: 'Orange' },
  // Urgent
  { id: 'abdominal_pain', label: 'Abdominal pain', category: 'Yellow' },
  { id: 'moderate_pain', label: 'Moderate pain', category: 'Yellow' },
  { id: 'persistent_vomiting', label: 'Persistent vomiting', category: 'Yellow' },
  { id: 'fracture_closed', label: 'Suspected closed fracture', category: 'Yellow' },
  { id: 'head_injury_moderate', label: 'Head injury — moderate', category: 'Yellow' },
  { id: 'haemorrhage_controlled', label: 'Haemorrhage — controlled', category: 'Yellow' },
];

const DISCRIMINATOR_BY_ID = new Map(DISCRIMINATORS.map((d) => [d.id, d]));

// ─── Input / output ──────────────────────────────────────────────────────────

export type Avpu = 'Alert' | 'Voice' | 'Pain' | 'Unresponsive';
export type Mobility = 'Walking' | 'WithHelp' | 'Stretcher';

export interface Vitals {
  respiratoryRate?: number | null;
  heartRate?: number | null;
  systolicBp?: number | null;
  temperatureC?: number | null;
  spo2?: number | null;
  glucoseMmol?: number | null;
}

export interface TriageInput {
  vitals?: Vitals;
  avpu?: Avpu | null;
  mobility?: Mobility | null;
  trauma?: boolean;
  discriminators?: string[];
  /** Age in years when known. TEWS below is the adult scale. */
  ageYears?: number | null;
  /** Patient-reported symptoms (from the symptom checker) — used only when no vitals exist. */
  symptoms?: { severity: 'Mild' | 'Moderate' | 'Severe' }[];
}

export interface TriageSuggestion {
  /** null when there is not enough information to suggest anything. */
  category: TriageCategory | null;
  priority: number | null;
  tewsScore: number | null;
  confidence: 'high' | 'medium' | 'low';
  targetMinutes: number | null;
  rationale: string[];
  /** Inputs that were not supplied and would improve the suggestion. */
  missing: string[];
  /** True when a clinician must decide (paediatric patient, or no data). */
  requiresManual: boolean;
}

// ─── TEWS ────────────────────────────────────────────────────────────────────

const has = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);

export function scoreRespiratoryRate(rr: number): number {
  if (rr < 9) return 2;
  if (rr <= 14) return 0;
  if (rr <= 20) return 1;
  if (rr <= 29) return 2;
  return 3;
}

export function scoreHeartRate(hr: number): number {
  if (hr < 41) return 2;
  if (hr <= 50) return 1;
  if (hr <= 100) return 0;
  if (hr <= 110) return 1;
  if (hr <= 129) return 2;
  return 3;
}

export function scoreSystolicBp(sbp: number): number {
  if (sbp < 71) return 3;
  if (sbp <= 80) return 2;
  if (sbp <= 100) return 1;
  if (sbp <= 199) return 0;
  return 2;
}

export function scoreTemperature(t: number): number {
  return t < 35 || t >= 38.5 ? 2 : 0;
}

const AVPU_SCORE: Record<Avpu, number> = { Alert: 0, Voice: 1, Pain: 2, Unresponsive: 3 };
const MOBILITY_SCORE: Record<Mobility, number> = { Walking: 0, WithHelp: 1, Stretcher: 2 };

export function categoryFromTews(score: number): TriageCategory {
  if (score >= 7) return 'Red';
  if (score >= 5) return 'Orange';
  if (score >= 3) return 'Yellow';
  return 'Green';
}

function mostUrgent(a: TriageCategory, b: TriageCategory): TriageCategory {
  return TRIAGE_META[a].priority <= TRIAGE_META[b].priority ? a : b;
}

// ─── Suggestion ──────────────────────────────────────────────────────────────

export function suggestTriage(input: TriageInput): TriageSuggestion {
  const v = input.vitals ?? {};
  const rationale: string[] = [];
  const missing: string[] = [];
  const isChild = has(input.ageYears) && input.ageYears < 13;

  // Held in an object so TypeScript does not narrow it to `null` across the closure below.
  const state: { category: TriageCategory | null } = { category: null };
  const raise = (c: TriageCategory) => {
    state.category = state.category ? mostUrgent(state.category, c) : c;
  };

  // 1. Clinical discriminators always apply, whatever the age.
  for (const id of input.discriminators ?? []) {
    const d = DISCRIMINATOR_BY_ID.get(id);
    if (!d) continue;
    rationale.push(`${d.label} → ${d.category}`);
    raise(d.category);
  }

  // 2. Safety escalations from vitals that are not part of TEWS itself.
  if (has(v.glucoseMmol) && v.glucoseMmol < 3) {
    rationale.push(`Glucose ${v.glucoseMmol} mmol/L (hypoglycaemia) → Red`);
    raise('Red');
  }
  if (has(v.spo2)) {
    if (v.spo2 < 85) {
      rationale.push(`SpO₂ ${v.spo2}% (severe hypoxia) → Red`);
      raise('Red');
    } else if (v.spo2 < 90) {
      rationale.push(`SpO₂ ${v.spo2}% (hypoxia) → Orange`);
      raise('Orange');
    }
  }

  // 3. TEWS — adult scale only.
  let tews: number | null = null;
  const vitalsGiven = [v.respiratoryRate, v.heartRate, v.systolicBp, v.temperatureC].filter(has).length;

  if (isChild) {
    rationale.push('Patient is under 13: the adult TEWS does not apply — use the paediatric triage scale.');
  } else {
    const parts: string[] = [];
    let score = 0;
    if (has(v.respiratoryRate)) { const s = scoreRespiratoryRate(v.respiratoryRate); score += s; parts.push(`RR ${v.respiratoryRate}=${s}`); } else missing.push('respiratory rate');
    if (has(v.heartRate)) { const s = scoreHeartRate(v.heartRate); score += s; parts.push(`HR ${v.heartRate}=${s}`); } else missing.push('heart rate');
    if (has(v.systolicBp)) { const s = scoreSystolicBp(v.systolicBp); score += s; parts.push(`SBP ${v.systolicBp}=${s}`); } else missing.push('systolic BP');
    if (has(v.temperatureC)) { const s = scoreTemperature(v.temperatureC); score += s; parts.push(`Temp ${v.temperatureC}=${s}`); } else missing.push('temperature');
    if (input.avpu) { const s = AVPU_SCORE[input.avpu]; score += s; parts.push(`AVPU ${input.avpu}=${s}`); } else missing.push('AVPU');
    if (input.mobility) { const s = MOBILITY_SCORE[input.mobility]; score += s; parts.push(`Mobility ${input.mobility}=${s}`); } else missing.push('mobility');
    if (input.trauma) { score += 1; parts.push('Trauma=1'); }

    if (vitalsGiven > 0 || input.avpu || input.mobility) {
      tews = score;
      const c = categoryFromTews(score);
      rationale.push(`TEWS ${score} (${parts.join(', ')}) → ${c}`);
      raise(c);
    }
  }

  // 4. Symptom-only fallback — deliberately conservative (never Red/Orange).
  const usedSymptomsOnly = state.category === null && !!input.symptoms?.length;
  if (usedSymptomsOnly) {
    const severe = input.symptoms!.some((s) => s.severity === 'Severe');
    const c: TriageCategory = severe ? 'Yellow' : 'Green';
    rationale.push(
      severe
        ? 'Patient reported a severe symptom (no vitals recorded) → Yellow'
        : 'Only mild/moderate symptoms reported (no vitals recorded) → Green'
    );
    raise(c);
  }

  if (state.category === null) {
    return {
      category: null,
      priority: null,
      tewsScore: tews,
      confidence: 'low',
      targetMinutes: null,
      rationale: rationale.length ? rationale : ['Not enough information to suggest a category — record vitals or select discriminators.'],
      missing,
      requiresManual: true,
    };
  }

  const finalCategory: TriageCategory = state.category;
  const meta = TRIAGE_META[finalCategory];
  const hasDiscriminatorOrTews = (input.discriminators?.length ?? 0) > 0 || tews !== null;
  const confidence: TriageSuggestion['confidence'] =
    usedSymptomsOnly || isChild || !hasDiscriminatorOrTews
      ? 'low'
      : vitalsGiven >= 4 && input.avpu
        ? 'high'
        : 'medium';

  return {
    category: finalCategory,
    priority: meta.priority,
    tewsScore: tews,
    confidence,
    targetMinutes: meta.targetMinutes,
    rationale,
    missing,
    requiresManual: isChild || usedSymptomsOnly,
  };
}
