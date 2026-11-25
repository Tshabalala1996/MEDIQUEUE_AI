import { query, queryOne } from './db';
import type { TriageInput } from './triage';

export interface QueueTriageContext {
  queue_id: number;
  appointment_id: number;
  patient_id: number;
  doctor_id: number;
  status: string;
  queue_date: string;
  patient_name: string;
  ageYears: number | null;
  symptoms: { severity: 'Mild' | 'Moderate' | 'Severe' }[];
}

/** Shared with the AI emergency pre-check, which also needs age-from-DOB. */
export function ageFrom(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const beforeBirthday = now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
  if (beforeBirthday) age--;
  return age >= 0 ? age : null;
}

/** patient_symptoms.severity is stored as 1–3 by booking, but tolerate a textual enum too. */
function toSeverity(raw: unknown): 'Mild' | 'Moderate' | 'Severe' {
  if (raw === 3 || raw === '3' || raw === 'Severe') return 'Severe';
  if (raw === 2 || raw === '2' || raw === 'Moderate') return 'Moderate';
  return 'Mild';
}

/** Everything the triage engine needs to know about a queue entry's patient. */
export async function loadTriageContext(queueId: number): Promise<QueueTriageContext | null> {
  const row = await queryOne<{
    queue_id: number; appointment_id: number; patient_id: number; doctor_id: number;
    status: string; queue_date: string; patient_name: string; dob: string | null;
  }>(
    `SELECT q.queue_id, q.appointment_id, a.patient_id, q.doctor_id, q.status,
            DATE_FORMAT(q.queue_date, '%Y-%m-%d') AS queue_date,
            u.full_name AS patient_name,
            DATE_FORMAT(u.date_of_birth, '%Y-%m-%d') AS dob
       FROM queue q
       JOIN appointments a ON a.appointment_id = q.appointment_id
       JOIN patients p ON p.patient_id = a.patient_id
       JOIN users u ON u.user_id = p.user_id
      WHERE q.queue_id = ?`,
    [queueId]
  );
  if (!row) return null;

  let symptoms: QueueTriageContext['symptoms'] = [];
  try {
    const rows = await query<{ severity: unknown }[]>(
      'SELECT severity FROM patient_symptoms WHERE patient_id = ? LIMIT 10',
      [row.patient_id]
    );
    symptoms = rows.map((r) => ({ severity: toSeverity(r.severity) }));
  } catch {
    // Symptoms are optional context; triage works without them.
  }

  return {
    queue_id: row.queue_id,
    appointment_id: row.appointment_id,
    patient_id: row.patient_id,
    doctor_id: row.doctor_id,
    status: row.status,
    queue_date: row.queue_date,
    patient_name: row.patient_name,
    ageYears: ageFrom(row.dob),
    symptoms,
  };
}

type ClinicalInput = Omit<TriageInput, 'ageYears' | 'symptoms'>;

/** Merges the clinician's inputs with what the system already knows about the patient. */
export function buildTriageInput(input: ClinicalInput, ctx: QueueTriageContext): TriageInput {
  return { ...input, ageYears: ctx.ageYears, symptoms: ctx.symptoms };
}
