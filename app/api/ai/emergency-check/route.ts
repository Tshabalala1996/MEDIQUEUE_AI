import { NextRequest } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { emergencyPrecheckSchema } from '@/lib/validators';
import { runEmergencyCheck } from '@/lib/ai/emergencyCheck';
import { doctorLabel, findAvailableDoctor, fastTrackEmergency } from '@/lib/emergencyRouting';
import { ageFrom } from '@/lib/triageService';
import { ok, badRequest, notFound, forbidden, serverError, unauthorized, validationError } from '@/lib/response';

export const dynamic = 'force-dynamic';

const DISCLAIMER =
  'This automated check is not a medical diagnosis and cannot replace emergency services. ' +
  'If you are experiencing a life-threatening emergency, call emergency services (10177 / 112) ' +
  'or go to your nearest Emergency Department immediately.';

// A small dedicated limiter, separate from lib/ratelimit.ts's shared default (100 / 15 min),
// because this endpoint calls a paid, metered external API per request.
const CHECK_WINDOW_MS = 15 * 60 * 1000;
const CHECK_MAX = 8;
const checkCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = checkCounts.get(key);
  if (!entry || now > entry.resetAt) {
    checkCounts.set(key, { count: 1, resetAt: now + CHECK_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > CHECK_MAX;
}

/**
 * AI emergency symptom pre-check. A patient describes what's happening in
 * free text; this screens for emergency red flags and, if found, fast-tracks
 * them straight into an available doctor's queue at top priority instead of
 * a routine booking. See lib/ai/emergencyCheck.ts for the safety design.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Patient')) return forbidden('The emergency pre-check is for patients booking their own care');

  if (checkRateLimited(`emergency-check:${user.userId}`)) {
    return badRequest('Too many checks. If this is an ongoing emergency, please call emergency services or go to the nearest Emergency Department.');
  }

  const body = await request.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON');

  const parsed = emergencyPrecheckSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  const { hospital_id, description } = parsed.data;

  try {
    const patient = await queryOne<{ id: number; dob: string | null }>(
      `SELECT p.patient_id AS id, DATE_FORMAT(u.date_of_birth, '%Y-%m-%d') AS dob
         FROM patients p JOIN users u ON u.user_id = p.user_id WHERE p.user_id = ?`,
      [user.userId]
    );
    if (!patient) return forbidden('Patient record not found');

    const hospital = await queryOne<{ id: number }>('SELECT hospital_id AS id FROM hospitals WHERE hospital_id = ? AND is_active = 1', [hospital_id]);
    if (!hospital) return notFound('Hospital not found');

    const result = await runEmergencyCheck(description, ageFrom(patient.dob));

    // Audit trail regardless of outcome — always written before we act on the result.
    const auditInsert = await query<{ insertId: number }>(
      `INSERT INTO ai_symptom_checks
         (patient_id, hospital_id, description, source, is_emergency, category, confidence, red_flags, reasoning, model, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [patient.id, hospital_id, description, result.source, result.isEmergency ? 1 : 0, result.category,
       result.confidence, JSON.stringify(result.redFlags), result.reasoning, result.model, result.latencyMs]
    ).catch((err) => { console.error('[Emergency check] audit log failed', err); return null; });
    const checkId = auditInsert ? (auditInsert as unknown as { insertId: number }).insertId : null;

    const base = {
      disclaimer: DISCLAIMER,
      category: result.category,
      confidence: result.confidence,
      red_flags: result.redFlags,
      source: result.source,
      message: result.advice,
    };

    if (!result.isEmergency) {
      return ok({
        ...base,
        emergency: false,
        unavailable: result.source === 'unavailable',
      });
    }

    // Only Red/Orange ever reach here (enforced in runEmergencyCheck).
    const category = result.category as 'Red' | 'Orange';
    const doctor = await findAvailableDoctor(hospital_id);

    if (!doctor) {
      if (checkId) {
        await query('UPDATE ai_symptom_checks SET doctor_available = 0 WHERE check_id = ?', [checkId]).catch(() => null);
      }
      return ok({
        ...base,
        emergency: true,
        doctorAvailable: false,
        message: 'No doctor is currently available for immediate emergency care at this hospital. Please go to the nearest Emergency Department now, or call emergency services if you cannot get there safely on your own.',
      });
    }

    const fastTrack = await fastTrackEmergency({
      patientId: patient.id,
      patientUserId: user.userId,
      hospitalId: hospital_id,
      doctor,
      category,
      confidence: result.confidence,
      reasoning: result.reasoning,
      description,
    });

    if (checkId) {
      await query(
        'UPDATE ai_symptom_checks SET doctor_available = 1, appointment_id = ?, queue_id = ? WHERE check_id = ?',
        [fastTrack.appointmentId, fastTrack.queueId, checkId]
      ).catch(() => null);
    }

    return ok({
      ...base,
      emergency: true,
      doctorAvailable: true,
      appointmentId: fastTrack.appointmentId,
      queueId: fastTrack.queueId,
      doctorName: doctor.fullName,
      message: `You have been added to ${doctorLabel(doctor.fullName)}'s queue with top priority. Please proceed to the hospital now.`,
    });
  } catch (err) {
    console.error('[Emergency check]', err);
    return serverError();
  }
}
