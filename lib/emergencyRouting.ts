import { query, queryOne } from './db';
import { sendEmergencyNotification } from './notifications';
import { recalculateQueueEstimates } from './waitTimeService';
import { emitQueueUpdate } from './socketServer';
import { broadcastQueueUpdate } from '@/app/api/queue/route';
import { doctorLabel } from './doctorDisplay';
import type { TriageCategory } from './triage';

export { doctorLabel };

/**
 * Finding and booking a doctor for a fast-tracked emergency (used by
 * app/api/ai/emergency-check). Scoped to hospitals only — clinics in this
 * system are not modelled as having emergency/casualty capacity.
 */

export interface AvailableDoctor {
  doctorId: number;
  fullName: string;
  /**
   * Which check found them, most to least certain. `assigned-to-hospital` and
   * `any-active-doctor` are last-resort tiers: for a flagged emergency, a
   * doctor is not optional just because nobody happened to publish a time
   * slot for today — someone is always assigned to handle it.
   */
  tier: 'on-shift' | 'active-today' | 'scheduled-today' | 'assigned-to-hospital' | 'any-active-doctor';
}

/**
 * Looks for a doctor to see this patient right now, in five tiers (most to
 * least certain), picking whoever is least busy within a tier. For an
 * emergency, "no doctor available" is not an acceptable normal outcome — the
 * last two tiers exist so this only returns null when there is truly not a
 * single active doctor anywhere in the system (a genuinely empty deployment).
 */
export async function findAvailableDoctor(hospitalId: number): Promise<AvailableDoctor | null> {
  // Tier 1: on shift right now, per their published time slots.
  const onShift = await queryOne<{ doctor_id: number; full_name: string }>(
    `SELECT d.doctor_id, du.full_name,
            (SELECT COUNT(*) FROM queue q2 WHERE q2.doctor_id = d.doctor_id AND q2.queue_date = CURDATE()
              AND q2.status IN ('Waiting','In-Progress')) AS current_load
       FROM doctors d
       JOIN users du ON du.user_id = d.user_id
       JOIN hospital_time_slots ts ON ts.doctor_id = d.doctor_id AND ts.hospital_id = ?
            AND ts.slot_date = CURDATE() AND ts.start_time <= CURTIME() AND ts.end_time >= CURTIME()
            AND ts.is_available = 1
      WHERE du.is_active = 1 AND d.is_available = 1
      GROUP BY d.doctor_id, du.full_name
      ORDER BY current_load ASC
      LIMIT 1`,
    [hospitalId]
  );
  if (onShift) return { doctorId: onShift.doctor_id, fullName: onShift.full_name, tier: 'on-shift' };

  // Tier 2: already seeing patients at this hospital today (has queue activity), least busy first.
  const activeToday = await queryOne<{ doctor_id: number; full_name: string }>(
    `SELECT d.doctor_id, du.full_name, COUNT(*) AS current_load
       FROM queue q
       JOIN doctors d ON d.doctor_id = q.doctor_id
       JOIN users du ON du.user_id = d.user_id
      WHERE q.hospital_id = ? AND q.facility_type = 'Hospital' AND q.queue_date = CURDATE()
        AND du.is_active = 1 AND q.status IN ('Waiting','In-Progress')
      GROUP BY d.doctor_id, du.full_name
      ORDER BY current_load ASC
      LIMIT 1`,
    [hospitalId]
  );
  if (activeToday) return { doctorId: activeToday.doctor_id, fullName: activeToday.full_name, tier: 'active-today' };

  // Tier 3: scheduled to work at this hospital today at all (time slots exist), even if not yet started.
  const scheduledToday = await queryOne<{ doctor_id: number; full_name: string }>(
    `SELECT d.doctor_id, du.full_name, d.rating_avg
       FROM doctors d
       JOIN users du ON du.user_id = d.user_id
       JOIN hospital_time_slots ts ON ts.doctor_id = d.doctor_id AND ts.hospital_id = ? AND ts.slot_date = CURDATE()
            AND ts.is_available = 1
      WHERE du.is_active = 1 AND d.is_available = 1
      GROUP BY d.doctor_id, du.full_name, d.rating_avg
      ORDER BY d.rating_avg DESC
      LIMIT 1`,
    [hospitalId]
  );
  if (scheduledToday) return { doctorId: scheduledToday.doctor_id, fullName: scheduledToday.full_name, tier: 'scheduled-today' };

  // Tier 4: assigned to this hospital at all (no time slots published for today, but they do work
  // here) — the most common real gap: staff exist, nobody has filled in today's roster yet.
  const assignedToHospital = await queryOne<{ doctor_id: number; full_name: string }>(
    `SELECT d.doctor_id, du.full_name,
            (SELECT COUNT(*) FROM queue q2 WHERE q2.doctor_id = d.doctor_id AND q2.queue_date = CURDATE()
              AND q2.status IN ('Waiting','In-Progress')) AS current_load
       FROM doctors d
       JOIN users du ON du.user_id = d.user_id
       JOIN doctor_hospital_assignments dha ON dha.doctor_id = d.doctor_id AND dha.hospital_id = ? AND dha.is_active = 1
      WHERE du.is_active = 1 AND d.is_available = 1
      GROUP BY d.doctor_id, du.full_name
      ORDER BY current_load ASC
      LIMIT 1`,
    [hospitalId]
  );
  if (assignedToHospital) return { doctorId: assignedToHospital.doctor_id, fullName: assignedToHospital.full_name, tier: 'assigned-to-hospital' };

  // Tier 5: absolute last resort — this hospital has no doctors configured against it at all
  // (a data-setup gap), so reach system-wide rather than turn an emergency away.
  const anyActiveDoctor = await queryOne<{ doctor_id: number; full_name: string }>(
    `SELECT d.doctor_id, du.full_name,
            (SELECT COUNT(*) FROM queue q2 WHERE q2.doctor_id = d.doctor_id AND q2.queue_date = CURDATE()
              AND q2.status IN ('Waiting','In-Progress')) AS current_load
       FROM doctors d
       JOIN users du ON du.user_id = d.user_id
      WHERE du.is_active = 1
      GROUP BY d.doctor_id, du.full_name
      ORDER BY current_load ASC
      LIMIT 1`
  );
  if (anyActiveDoctor) return { doctorId: anyActiveDoctor.doctor_id, fullName: anyActiveDoctor.full_name, tier: 'any-active-doctor' };

  return null;
}

export interface FastTrackArgs {
  patientId: number;
  patientUserId: number;
  hospitalId: number;
  doctor: AvailableDoctor;
  category: Extract<TriageCategory, 'Red' | 'Orange'>;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  /** Patient's own description — stored as the appointment reason and triage rationale. */
  description: string;
}

export interface FastTrackResult {
  appointmentId: number;
  queueId: number;
  priorityLevel: number;
}

/**
 * Creates an immediate ("now") appointment and a top-priority queue entry for
 * an AI-flagged emergency, bypassing normal slot-capacity booking (emergencies
 * don't wait for a time slot), logs it in the triage history so staff can see
 * it needs confirming, and notifies the patient. Best-effort on notifications
 * and estimate recalculation — the booking itself either fully succeeds or throws.
 */
export async function fastTrackEmergency(args: FastTrackArgs): Promise<FastTrackResult> {
  const { patientId, patientUserId, hospitalId, doctor, category, confidence, reasoning, description } = args;
  const priorityLevel = category === 'Red' ? 1 : 2;

  const now = await queryOne<{ today: string }>(`SELECT DATE_FORMAT(NOW(), '%Y-%m-%d') AS today`);
  const queueDate = now!.today;

  const apptInsert = await query<{ insertId: number }>(
    `INSERT INTO appointments (patient_id, doctor_id, facility_type, hospital_id, appointment_datetime, status, reason, is_emergency)
     VALUES (?, ?, 'Hospital', ?, NOW(), 'Scheduled', ?, 1)`,
    [patientId, doctor.doctorId, hospitalId, `[AI Emergency Pre-Check] ${description.slice(0, 400)}`]
  );
  const appointmentId = (apptInsert as unknown as { insertId: number }).insertId;

  // The database's create_queue_entry trigger (AFTER INSERT on appointments) already created a
  // 'Waiting' queue row for this appointment — inserting a second one here would duplicate it.
  // Its priority_level/triage_category/ai_flagged all need setting to the emergency values, since
  // a plain trigger-created row only has the ordinary defaults (untriaged, not AI-flagged).
  const queueRow = await queryOne<{ id: number }>(
    'SELECT queue_id AS id FROM queue WHERE appointment_id = ?', [appointmentId]
  );
  if (!queueRow) throw new Error('Emergency queue entry was not created by the database trigger as expected');
  const queueId = queueRow.id;
  await query(
    'UPDATE queue SET priority_level = ?, triage_category = ?, ai_flagged = 1 WHERE queue_id = ?',
    [priorityLevel, category, queueId]
  );

  // Logged in the same triage_assessments history staff already review, so it shows up
  // alongside human triage and is auditable as AI-initiated (source), not a clinician call.
  await query(
    `INSERT INTO triage_assessments
       (queue_id, appointment_id, patient_id, category, priority_level, ai_category, ai_confidence, source, rationale, assessed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'AI-Emergency', ?, ?)`,
    [queueId, appointmentId, patientId, category, priorityLevel, category, confidence, reasoning.slice(0, 600), patientUserId]
  ).catch((err) => console.error('[Emergency] triage_assessments log failed', err));

  await recalculateQueueEstimates(doctor.doctorId, queueDate).catch((err) => console.error('[Emergency] estimate refresh failed', err));
  broadcastQueueUpdate(doctor.doctorId, queueDate);
  emitQueueUpdate(doctor.doctorId, queueDate);

  const patientUser = await queryOne<{ email: string; phone: string | null; full_name: string }>(
    'SELECT email, phone, full_name FROM users WHERE user_id = ?', [patientUserId]
  );
  const hospital = await queryOne<{ name: string }>('SELECT name FROM hospitals WHERE hospital_id = ?', [hospitalId]);
  if (patientUser && hospital) {
    sendEmergencyNotification(
      patientUser.email, patientUser.phone, patientUserId, appointmentId,
      { patientName: patientUser.full_name, doctorName: doctorLabel(doctor.fullName), facilityName: hospital.name, category }
    ).catch(console.error);
  }

  return { appointmentId, queueId, priorityLevel };
}
