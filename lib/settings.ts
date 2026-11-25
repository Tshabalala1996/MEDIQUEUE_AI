import { query } from './db';

/**
 * Admin-managed system settings (FR07).
 *
 * Every setting here is actually consumed by the app:
 *   reminders_enabled / reminder_lead_hours / reminder_max_attempts → lib/reminders.ts
 *   default_consultation_minutes / ai_wait_prediction_enabled / ml_min_training_samples → lib/waitTimeService.ts
 */

export type SettingType = 'boolean' | 'number' | 'hours-list';

export interface SettingDef {
  key: keyof Settings;
  label: string;
  description: string;
  type: SettingType;
  default: string;
  min?: number;
  max?: number;
}

export interface Settings {
  reminders_enabled: boolean;
  /** Hours before the appointment at which an SMS reminder is sent, largest first. */
  reminder_lead_hours: number[];
  reminder_max_attempts: number;
  default_consultation_minutes: number;
  ai_wait_prediction_enabled: boolean;
  ml_min_training_samples: number;
}

export const SETTING_DEFS: SettingDef[] = [
  {
    key: 'reminders_enabled',
    label: 'Automated SMS reminders',
    description: 'Send SMS reminders before upcoming appointments.',
    type: 'boolean',
    default: 'true',
  },
  {
    key: 'reminder_lead_hours',
    label: 'Reminder lead times (hours before)',
    description: 'Comma-separated hours before the appointment, e.g. "24,2" sends one reminder a day before and one two hours before.',
    type: 'hours-list',
    default: '24,2',
  },
  {
    key: 'reminder_max_attempts',
    label: 'Reminder retry limit',
    description: 'How many times a failed SMS reminder is attempted before giving up.',
    type: 'number',
    default: '3',
    min: 1,
    max: 10,
  },
  {
    key: 'default_consultation_minutes',
    label: 'Default consultation length (minutes)',
    description: 'Used for wait-time estimates when a doctor has no consultation history yet.',
    type: 'number',
    default: '15',
    min: 5,
    max: 120,
  },
  {
    key: 'ai_wait_prediction_enabled',
    label: 'Use trained AI model for wait times',
    description: 'When off, wait times use the simple queueing formula even if a trained model exists.',
    type: 'boolean',
    default: 'true',
  },
  {
    key: 'ml_min_training_samples',
    label: 'Minimum consultations to train the model',
    description: 'The wait-time model is not trained (and the formula is used) until this many completed consultations exist.',
    type: 'number',
    default: '30',
    min: 10,
    max: 10000,
  },
];

const DEF_BY_KEY = new Map(SETTING_DEFS.map((d) => [d.key as string, d]));

// ─── Parsing / validation ────────────────────────────────────────────────────

export function parseHoursList(raw: string): number[] | null {
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (!parts.length || parts.length > 5) return null;
  const nums = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
  if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > 168)) return null;
  return [...new Set(nums)].sort((a, b) => b - a);
}

export type ValidationResult = { ok: true; value: string } | { ok: false; error: string };

export function validateSetting(key: string, raw: unknown): ValidationResult {
  const def = DEF_BY_KEY.get(key);
  if (!def) return { ok: false, error: `Unknown setting "${key}"` };
  const text = String(raw).trim();

  switch (def.type) {
    case 'boolean':
      if (text !== 'true' && text !== 'false') return { ok: false, error: `${def.label} must be true or false` };
      return { ok: true, value: text };
    case 'number': {
      if (!/^\d+$/.test(text)) return { ok: false, error: `${def.label} must be a whole number` };
      const n = Number(text);
      if (n < (def.min ?? 0) || n > (def.max ?? Number.MAX_SAFE_INTEGER)) {
        return { ok: false, error: `${def.label} must be between ${def.min} and ${def.max}` };
      }
      return { ok: true, value: String(n) };
    }
    case 'hours-list': {
      const list = parseHoursList(text);
      if (!list) return { ok: false, error: `${def.label} must be 1–5 whole numbers between 1 and 168, comma-separated` };
      return { ok: true, value: list.join(',') };
    }
  }
}

function coerce(map: Record<string, string>): Settings {
  const get = (k: keyof Settings) => map[k] ?? DEF_BY_KEY.get(k)!.default;
  const num = (k: keyof Settings) => {
    const def = DEF_BY_KEY.get(k)!;
    const n = Number(get(k));
    return Number.isFinite(n) ? n : Number(def.default);
  };
  return {
    reminders_enabled: get('reminders_enabled') === 'true',
    reminder_lead_hours: parseHoursList(get('reminder_lead_hours')) ?? parseHoursList(DEF_BY_KEY.get('reminder_lead_hours')!.default)!,
    reminder_max_attempts: num('reminder_max_attempts'),
    default_consultation_minutes: num('default_consultation_minutes'),
    ai_wait_prediction_enabled: get('ai_wait_prediction_enabled') === 'true',
    ml_min_training_samples: num('ml_min_training_samples'),
  };
}

// ─── Storage ─────────────────────────────────────────────────────────────────

// Short TTL: Next.js may load this module once per route bundle, so a longer
// cache would let one route serve a stale value after another route saved.
const CACHE_TTL_MS = 5_000;
let cache: { at: number; raw: Record<string, string> } | null = null;

export function invalidateSettingsCache(): void {
  cache = null;
}

/** Raw stored values merged over defaults. Falls back to defaults if the table is missing. */
export async function getRawSettings(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.raw;
  const raw: Record<string, string> = {};
  for (const d of SETTING_DEFS) raw[d.key] = d.default;
  try {
    const rows = await query<{ setting_key: string; setting_value: string }[]>(
      'SELECT setting_key, setting_value FROM system_settings'
    );
    for (const r of rows) if (DEF_BY_KEY.has(r.setting_key)) raw[r.setting_key] = r.setting_value;
  } catch {
    // system_settings not created yet (migration pending) — defaults apply.
  }
  cache = { at: Date.now(), raw };
  return raw;
}

export async function getSettings(): Promise<Settings> {
  return coerce(await getRawSettings());
}

export async function saveSettings(values: Record<string, string>, userId: number): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    await query(
      `INSERT INTO system_settings (setting_key, setting_value, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
      [key, value, userId]
    );
  }
  invalidateSettingsCache();
}
