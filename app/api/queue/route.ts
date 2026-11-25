import { NextRequest } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { ok, unauthorized, serverError } from '@/lib/response';

// Broadcast SSE event to all connected clients for a doctor
const sseClients = new Map<string, Set<ReadableStreamDefaultController>>();

export function broadcastQueueUpdate(doctorId: number, date: string) {
  const key = `${doctorId}:${date}`;
  const clients = sseClients.get(key);
  if (!clients?.size) return;
  clients.forEach((ctrl) => {
    try {
      ctrl.enqueue(`event: queue-update\ndata: ${JSON.stringify({ doctorId, date, timestamp: Date.now() })}\n\n`);
    } catch { /* client disconnected */ }
  });
}

export function registerSSEClient(doctorId: number, date: string, ctrl: ReadableStreamDefaultController) {
  const key = `${doctorId}:${date}`;
  if (!sseClients.has(key)) sseClients.set(key, new Set());
  sseClients.get(key)!.add(ctrl);
}

export function unregisterSSEClient(doctorId: number, date: string, ctrl: ReadableStreamDefaultController) {
  const key = `${doctorId}:${date}`;
  sseClients.get(key)?.delete(ctrl);
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();

  const { searchParams } = request.nextUrl;
  const doctor_id = searchParams.get('doctor_id');
  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);

  const conditions: string[] = ['q.queue_date = ?'];
  const params: unknown[] = [date];

  if (hasRole(user, 'Patient')) {
    const patient = await queryOne<{ id: number }>('SELECT patient_id AS id FROM patients WHERE user_id = ?', [user.userId]);
    if (!patient) return ok([]);
    conditions.push('a.patient_id = ?');
    params.push(patient.id);
  } else if (doctor_id) {
    conditions.push('q.doctor_id = ?'); params.push(Number(doctor_id));
  } else if (hasRole(user, 'Doctor')) {
    const doctor = await queryOne<{ id: number }>('SELECT doctor_id AS id FROM doctors WHERE user_id = ?', [user.userId]);
    if (doctor) { conditions.push('q.doctor_id = ?'); params.push(doctor.id); }
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  try {
    const queue = await query<unknown[]>(
      `SELECT q.queue_id AS id, q.appointment_id, q.doctor_id, a.patient_id,
              q.position AS queue_position, q.status,
              q.estimated_wait_mins AS estimated_wait_minutes,
              CASE WHEN q.status = 'Waiting' THEN (
                SELECT COUNT(*) FROM queue q2
                 WHERE q2.doctor_id = q.doctor_id AND q2.queue_date = q.queue_date
                   AND q2.queue_id <> q.queue_id AND q2.status IN ('Waiting','In-Progress')
                   AND (q2.status = 'In-Progress'
                        OR q2.priority_level < q.priority_level
                        OR (q2.priority_level = q.priority_level AND q2.position < q.position))
              ) ELSE 0 END AS patients_ahead,
              q.priority_level, q.triage_category, q.referred_to, q.referral_reason, q.ai_flagged,
              q.called_at, q.ended_at AS completed_at,
              a.appointment_datetime,
              d.consultation_fee,
              -- appointments has no care_type column in the real schema (a pre-existing gap: the
              -- booking page collects Public/Private but it was never persisted) — this was crashing
              -- every call to this endpoint. 'Public' matches what the old COALESCE fallback always
              -- resolved to anyway, so this keeps the same behaviour for existing callers.
              'Public' AS care_type,
              pu.full_name AS patient_name,
              du.full_name AS doctor_name,
              COALESCE(h.name, cl.name) AS facility_name
       FROM queue q
       JOIN appointments a ON a.appointment_id = q.appointment_id
       JOIN patients p ON p.patient_id = a.patient_id
       JOIN users pu ON pu.user_id = p.user_id
       JOIN doctors d ON d.doctor_id = q.doctor_id
       JOIN users du ON du.user_id = d.user_id
       LEFT JOIN hospitals h ON h.hospital_id = q.hospital_id AND q.facility_type = 'Hospital'
       LEFT JOIN clinics cl ON cl.clinic_id = q.clinic_id AND q.facility_type = 'Clinic'
       ${where}
       ORDER BY q.priority_level ASC, q.position ASC`,
      params
    );
    return ok(queue);
  } catch (err) {
    console.error('[Queue GET]', err);
    return serverError();
  }
}
