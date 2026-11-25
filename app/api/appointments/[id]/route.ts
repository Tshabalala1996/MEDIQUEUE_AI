import { NextRequest } from 'next/server';
import { queryOne, query } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { ok, notFound, forbidden, serverError, badRequest, unauthorized } from '@/lib/response';
import { recalculateQueueEstimates } from '@/lib/waitTimeService';
import { emitQueueUpdate } from '@/lib/socketServer';
import { broadcastQueueUpdate } from '@/app/api/queue/route';
import { z } from 'zod';

const updateSchema = z.object({
  status: z.enum(['Scheduled', 'Confirmed', 'In-Progress', 'Completed', 'Cancelled', 'No-Show', 'Referred']).optional(),
  appointment_datetime: z.string().optional(),
  reason_for_visit: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  try {
    const appointment = await queryOne<Record<string, unknown>>(
      `SELECT a.appointment_id AS id, a.patient_id, a.doctor_id, a.facility_type, a.is_emergency,
              COALESCE(a.hospital_id, a.clinic_id) AS facility_id,
              a.appointment_datetime, a.status, a.reason AS reason_for_visit,
              d.consultation_fee,
              pu.full_name AS patient_name,
              pu.phone AS patient_phone, pu.email AS patient_email,
              du.full_name AS doctor_name,
              COALESCE(h.name, cl.name) AS facility_name, a.created_at
       FROM appointments a
       JOIN patients p ON p.patient_id = a.patient_id
       JOIN users pu ON pu.user_id = p.user_id
       JOIN doctors d ON d.doctor_id = a.doctor_id
       JOIN users du ON du.user_id = d.user_id
       LEFT JOIN hospitals h ON h.hospital_id = a.hospital_id AND a.facility_type = 'Hospital'
       LEFT JOIN clinics cl ON cl.clinic_id = a.clinic_id AND a.facility_type = 'Clinic'
       WHERE a.appointment_id = ?`,
      [id]
    );
    if (!appointment) return notFound();
    return ok(appointment);
  } catch (err) {
    console.error('[Appointment GET id]', err);
    return serverError();
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON');

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return badRequest('Invalid fields');

  const { status, appointment_datetime, reason_for_visit } = parsed.data;

  const isStaff = hasRole(user, 'Doctor', 'Nurse', 'Receptionist', 'Admin');

  // Patients can only cancel their own
  if (!isStaff) {
    if (status && status !== 'Cancelled') return forbidden('Patients can only cancel appointments');
    if (appointment_datetime) return forbidden('Please contact reception to reschedule an appointment');
    const owned = await queryOne(
      `SELECT a.appointment_id FROM appointments a JOIN patients p ON p.patient_id = a.patient_id
        WHERE a.appointment_id = ? AND p.user_id = ?`,
      [id, user.userId]
    );
    if (!owned) return forbidden('You can only change your own appointments');
  }

  const updates: string[] = [];
  const vals: unknown[] = [];

  if (status) { updates.push('status = ?'); vals.push(status); }
  if (appointment_datetime) { updates.push('appointment_datetime = ?'); vals.push(appointment_datetime); }
  if (reason_for_visit !== undefined) { updates.push('reason = ?'); vals.push(reason_for_visit); }

  if (!updates.length) return badRequest('No fields to update');
  vals.push(id);

  try {
    // Cancelling frees the patient's place in the queue and the slot they were holding.
    const released = status === 'Cancelled' ? await releaseQueueAndSlot(id) : null;

    // Log status change (best-effort — table may not exist in all environments)
    if (status) {
      await query(
        `INSERT INTO appointment_status_log (appointment_id, old_status, new_status, changed_by)
         SELECT appointment_id, status, ?, ? FROM appointments WHERE appointment_id = ?`,
        [status, user.userId, id]
      ).catch(() => { /* ignore if table doesn't exist */ });
    }
    await query(`UPDATE appointments SET ${updates.join(', ')} WHERE appointment_id = ?`, vals);

    if (released?.queue_date) {
      await recalculateQueueEstimates(released.doctor_id, released.queue_date).catch(console.error);
      broadcastQueueUpdate(released.doctor_id, released.queue_date);
      emitQueueUpdate(released.doctor_id, released.queue_date);
    }
    return ok(null, 'Appointment updated');
  } catch (err) {
    console.error('[Appointment PATCH]', err);
    return serverError();
  }
}

/**
 * Removes a still-waiting queue entry and returns the reserved slot place.
 * No-op when the appointment is unknown or was already cancelled/finished.
 */
async function releaseQueueAndSlot(appointmentId: string) {
  const appt = await queryOne<{
    doctor_id: number; facility_type: 'Hospital' | 'Clinic';
    hospital_slot_id: number | null; clinic_slot_id: number | null;
    previous_status: string; queue_date: string | null;
  }>(
    `SELECT a.doctor_id, a.facility_type, a.hospital_slot_id, a.clinic_slot_id, a.status AS previous_status,
            DATE_FORMAT(q.queue_date, '%Y-%m-%d') AS queue_date
       FROM appointments a LEFT JOIN queue q ON q.appointment_id = a.appointment_id
      WHERE a.appointment_id = ?`,
    [appointmentId]
  );
  if (!appt || !['Scheduled', 'Confirmed'].includes(appt.previous_status)) return null;

  await query(`DELETE FROM queue WHERE appointment_id = ? AND status = 'Waiting'`, [appointmentId]);

  const slotId = appt.facility_type === 'Hospital' ? appt.hospital_slot_id : appt.clinic_slot_id;
  if (slotId) {
    const table = appt.facility_type === 'Hospital' ? 'hospital_time_slots' : 'clinic_time_slots';
    await query(`UPDATE ${table} SET booked_count = GREATEST(booked_count - 1, 0) WHERE slot_id = ?`, [slotId]).catch(() => null);
  }
  return appt;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request);
  if (!user || !hasRole(user, 'Admin')) return forbidden();

  const { id } = await params;
  try {
    await query('DELETE FROM queue WHERE appointment_id = ?', [id]);
    await query('DELETE FROM appointments WHERE appointment_id = ?', [id]);
    return ok(null, 'Appointment deleted');
  } catch (err) {
    console.error('[Appointment DELETE]', err);
    return serverError();
  }
}
