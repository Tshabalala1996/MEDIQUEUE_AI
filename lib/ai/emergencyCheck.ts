import { z } from 'zod';
import { chatJSON, getModel, isOpenRouterConfigured } from './openrouter';
import type { TriageCategory } from '@/lib/triage';

/**
 * Emergency symptom pre-check: a patient describes what's happening in free
 * text, before booking, and this decides whether they should be fast-tracked
 * straight into a queue instead of booking a routine appointment.
 *
 * This is decision support that gates a real workflow action (queue-jumping),
 * so it is deliberately layered:
 *   1. An LLM screens the description for emergency red flags (primary).
 *   2. A fixed keyword list is checked independently either way (safety net —
 *      catches obvious red flags even if the LLM is unavailable or wrong).
 *   3. Only Red/Orange (SATS "emergency" / "very urgent") ever fast-tracks;
 *      Yellow/Green always goes through normal booking.
 *   4. If the LLM cannot be reached or its answer doesn't parse, the result is
 *      `unavailable` — never silently treated as "not an emergency".
 *
 * The final decision to actually queue-jump is made by the caller
 * (lib/emergencyRouting.ts) using this result, and a clinician still confirms
 * the priority via the existing triage screen as soon as the patient is seen.
 */

export type CheckSource = 'llm' | 'keyword-fallback' | 'unavailable';

export interface EmergencyCheckResult {
  source: CheckSource;
  isEmergency: boolean;
  category: TriageCategory | null;
  confidence: 'high' | 'medium' | 'low';
  redFlags: string[];
  reasoning: string;
  /** Patient-facing message from the model; a fixed message is used when unavailable. */
  advice: string;
  model: string | null;
  latencyMs: number;
}

const llmResponseSchema = z.object({
  is_emergency: z.boolean(),
  category: z.enum(['Red', 'Orange', 'Yellow', 'Green']),
  confidence: z.enum(['high', 'medium', 'low']).catch('medium'),
  red_flags: z.array(z.string().max(200)).max(10).catch([]),
  reasoning: z.string().max(600).catch(''),
  advice: z.string().max(400).catch(''),
});

// A deliberately narrow, non-exhaustive list of classic emergency presentations.
// This is a safety net, not the primary screen — it only ever pushes a result
// TOWARD emergency, never away from one the LLM already flagged.
const RED_FLAG_PATTERNS: { pattern: RegExp; flag: string }[] = [
  { pattern: /chest pain|tightness in (my|the) chest/i, flag: 'Chest pain' },
  { pattern: /can'?t breathe|cannot breathe|difficulty breathing|shortness of breath|gasping/i, flag: 'Breathing difficulty' },
  { pattern: /unconscious|unresponsive|passed out|fainted|not waking up/i, flag: 'Loss of consciousness' },
  { pattern: /severe bleeding|won'?t stop bleeding|bleeding heavily/i, flag: 'Uncontrolled bleeding' },
  { pattern: /stroke|face (is )?droop|slurred speech|one side (is )?weak|sudden numbness/i, flag: 'Possible stroke signs' },
  { pattern: /seizure|convulsion|fitting/i, flag: 'Seizure' },
  { pattern: /suicid|kill myself|want to die|end my life|self[\s-]?harm/i, flag: 'Self-harm / suicide risk' },
  { pattern: /overdose|took too many (pills|tablets)|poison/i, flag: 'Overdose / poisoning' },
  { pattern: /throat (is )?closing|can'?t swallow|swelling.*throat|anaphyla/i, flag: 'Possible anaphylaxis' },
  { pattern: /coughing (up )?blood|vomiting blood/i, flag: 'Coughing/vomiting blood' },
  { pattern: /severe burn|major burn/i, flag: 'Severe burn' },
  { pattern: /choking/i, flag: 'Choking' },
  { pattern: /car accident|hit by a car|fell from|major trauma|stabbed|gunshot/i, flag: 'Major trauma' },
];

function keywordScreen(description: string): { hit: boolean; flags: string[] } {
  const flags = RED_FLAG_PATTERNS.filter((p) => p.pattern.test(description)).map((p) => p.flag);
  return { hit: flags.length > 0, flags };
}

const SYSTEM_PROMPT = `You are a pre-hospital emergency screening assistant for a South African hospital queue system.
A patient will describe symptoms in their own words. Your only job is to flag whether this needs IMMEDIATE
in-person emergency care, using the South African Triage Scale (SATS):
  Red = Emergency (immediate threat to life)
  Orange = Very urgent (needs care within ~10 minutes)
  Yellow = Urgent but not an emergency (can wait for a normal appointment)
  Green = Routine (can wait for a normal appointment)

Rules:
- You are NOT diagnosing. You are screening for urgency only.
- Be conservative: if you are unsure whether something could be serious, prefer the more urgent category.
- Classic emergencies include: chest pain, breathing difficulty, stroke signs (face drooping, slurred speech,
  one-sided weakness), severe bleeding, loss of consciousness, seizures, anaphylaxis/severe allergic reaction,
  overdose or poisoning, suicidal thoughts or self-harm, major trauma, severe abdominal pain, high fever in an
  infant, and pregnancy with heavy bleeding or severe pain.
- "is_emergency" must be true if and only if category is "Red" or "Orange".
- "advice" is a short (1-2 sentence) plain-English message to show the patient directly. If is_emergency is
  true, it must tell them to proceed to the hospital or call emergency services now. If is_emergency is false,
  it must only say they can book a routine appointment and to seek care again if things get worse — it must
  NEVER suggest a medication, dosage, home remedy, or any other treatment, and never state or imply a diagnosis.
- Reply with ONLY a JSON object, no other text, matching exactly:
  {"is_emergency": boolean, "category": "Red"|"Orange"|"Yellow"|"Green", "confidence": "high"|"medium"|"low",
   "red_flags": string[], "reasoning": string, "advice": string}`;

const NON_EMERGENCY_FALLBACK_ADVICE =
  'This does not appear to be an emergency. You can continue and book a routine appointment. If your symptoms get worse, please seek medical care again.';

// A prompt can only reduce, not guarantee, an LLM won't slip into giving direct treatment advice
// (medication, dosage, home remedies) — verified empirically that it sometimes does. This is a
// server-side backstop so the patient never sees that text regardless of what the model said.
const TREATMENT_ADVICE_PATTERN =
  /\b(paracetamol|ibuprofen|aspirin|panado|acetaminophen|advil|tylenol|antibiotic|antihistamine|medication|medicine|dosage|\d+\s*mg|milligram|tablet|pill|over-the-counter|otc)\b/i;

function sanitizeAdvice(advice: string, isEmergency: boolean): string {
  if (!advice.trim() || TREATMENT_ADVICE_PATTERN.test(advice)) {
    return isEmergency ? FIXED_KEYWORD_ADVICE : NON_EMERGENCY_FALLBACK_ADVICE;
  }
  return advice;
}

const FIXED_UNAVAILABLE_ADVICE =
  'We could not run the automated check right now. If you believe this may be a medical emergency, please go to your nearest Emergency Department or call emergency services immediately. Otherwise you can continue and book a routine appointment.';

const FIXED_KEYWORD_ADVICE =
  'What you described may need urgent attention. Please proceed to the hospital now, or call emergency services if you cannot get there immediately.';

export async function runEmergencyCheck(description: string, ageYears: number | null): Promise<EmergencyCheckResult> {
  const keyword = keywordScreen(description);

  if (!isOpenRouterConfigured()) {
    return keyword.hit
      ? {
          source: 'keyword-fallback', isEmergency: true, category: 'Orange', confidence: 'low',
          redFlags: keyword.flags, reasoning: 'AI check unavailable; matched known emergency keywords.',
          advice: FIXED_KEYWORD_ADVICE, model: null, latencyMs: 0,
        }
      : {
          source: 'unavailable', isEmergency: false, category: null, confidence: 'low',
          redFlags: [], reasoning: 'AI check unavailable and no known emergency keywords matched.',
          advice: FIXED_UNAVAILABLE_ADVICE, model: null, latencyMs: 0,
        };
  }

  const userContent = [
    ageYears !== null ? `Patient age: ${ageYears} years.` : 'Patient age: unknown.',
    `Symptom description (patient's own words): """${description.slice(0, 2000)}"""`,
  ].join('\n');

  const res = await chatJSON(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    { maxTokens: 400, temperature: 0.1 }
  );

  if (!res.ok) {
    return keyword.hit
      ? {
          source: 'keyword-fallback', isEmergency: true, category: 'Orange', confidence: 'low',
          redFlags: keyword.flags, reasoning: `AI check failed (${res.error}); matched known emergency keywords.`,
          advice: FIXED_KEYWORD_ADVICE, model: res.model, latencyMs: res.latencyMs,
        }
      : {
          source: 'unavailable', isEmergency: false, category: null, confidence: 'low',
          redFlags: [], reasoning: `AI check failed: ${res.error}`,
          advice: FIXED_UNAVAILABLE_ADVICE, model: res.model, latencyMs: res.latencyMs,
        };
  }

  const parsed = llmResponseSchema.safeParse(res.data);
  if (!parsed.success) {
    return keyword.hit
      ? {
          source: 'keyword-fallback', isEmergency: true, category: 'Orange', confidence: 'low',
          redFlags: keyword.flags, reasoning: 'AI response did not match the expected format; matched known emergency keywords.',
          advice: FIXED_KEYWORD_ADVICE, model: res.model, latencyMs: res.latencyMs,
        }
      : {
          source: 'unavailable', isEmergency: false, category: null, confidence: 'low',
          redFlags: [], reasoning: 'AI response did not match the expected format.',
          advice: FIXED_UNAVAILABLE_ADVICE, model: res.model, latencyMs: res.latencyMs,
        };
  }

  const d = parsed.data;
  // Enforce the is_emergency <-> category coherence ourselves rather than trusting the model;
  // when they disagree, resolve toward the more cautious reading.
  const category: TriageCategory = d.is_emergency && (d.category === 'Yellow' || d.category === 'Green') ? 'Orange' : d.category;
  const isEmergency = d.is_emergency || category === 'Red' || category === 'Orange';

  // The keyword net can only escalate what the LLM decided, never downgrade it.
  const escalatedByKeyword = keyword.hit && !isEmergency;
  const finalIsEmergency = isEmergency || escalatedByKeyword;

  return {
    source: 'llm',
    isEmergency: finalIsEmergency,
    category: escalatedByKeyword ? 'Orange' : category,
    confidence: escalatedByKeyword ? 'low' : d.confidence,
    redFlags: escalatedByKeyword ? [...new Set([...d.red_flags, ...keyword.flags])] : d.red_flags,
    reasoning: escalatedByKeyword ? `${d.reasoning} (escalated: also matched known emergency keywords)` : d.reasoning,
    advice: escalatedByKeyword ? FIXED_KEYWORD_ADVICE : sanitizeAdvice(d.advice, finalIsEmergency),
    model: res.model,
    latencyMs: res.latencyMs,
  };
}

export { getModel as getEmergencyCheckModel };
