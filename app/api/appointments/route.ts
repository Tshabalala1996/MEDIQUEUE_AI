import { NextRequest } from 'next/server';
import { query, queryOne, transaction } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { appointmentSchema, paginationSchema } from '@/lib/validators';
import { ok, created, badRequest, conflict, unauthorized, forbidden, serverError, validationError } from '@/lib/response';
import { sendAppointmentConfirmation } from '@/lib/notifications';
import { predictForNewEntry } from '@/lib/waitTimeService';
import { emitQueueUpdate } from '@/lib/socketServer';
import { broadcastQueueUpdate } from '@/app/api/queue/route';

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();

  const { searchParams } = request.nextUrl;
  const { limit, offset } = paginationSchema.parse({
    limit: searchParams.get('limit'),
    offset: searchParams.get('offset'),
  });

  const status = searchParams.get('status');
  const date = searchParams.get('date');

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (hasRole(user, 'Patient')) {
    const patient = await queryOne<{ id: number }>(
      'SELECT patient_id AS id FROM patients WHERE user_id = ?', [user.userId]
    );
    if (!patient) return forbidden('Patient record not found');
    conditions.push('a.patient_id = ?');
    params.push(patient.id);
  } else if (hasRole(user, 'Doctor')) {
    const doctor = await queryOne<{ id: number }>(
      'SELECT doctor_id AS id FROM doctors WHERE user_id = ?', [user.userId]
    );
    if (!doctor) return forbidden('Doctor record not found');
    conditions.push('a.doctor_id = ?');
    params.push(doctor.id);
  } else {
    const doctorId = searchParams.get('doctor_id');
    if (doctorId) { conditions.push('a.doctor_id = ?'); params.push(Number(doctorId)); }
  }

  if (status) { conditions.push('a.status = ?'); params.push(status); }
  if (date) { conditions.push('DATE(a.appointment_datetime) = ?'); params.push(date); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [appointments, countRows] = await Promise.all([
      query<unknown[]>(
        `SELECT a.appointment_id AS id, a.patient_id, a.doctor_id, a.facility_type, a.is_emergency,
                COALESCE(a.hospital_id, a.clinic_id) AS facility_id,
                a.appointment_datetime, a.status, a.reason AS reason_for_visit,
                d.consultation_fee,
                pu.full_name AS patient_name,
                du.full_name AS doctor_name,
                COALESCE(h.name, cl.name) AS facility_name,
                s.name AS specialization_name, a.created_at
         FROM appointments a
         JOIN patients p ON p.patient_id = a.patient_id
         JOIN users pu ON pu.user_id = p.user_id
         JOIN doctors d ON d.doctor_id = a.doctor_id
         JOIN users du ON du.user_id = d.user_id
         JOIN specializations s ON s.specialization_id = d.specialization_id
         LEFT JOIN hospitals h ON h.hospital_id = a.hospital_id AND a.facility_type = 'Hospital'
         LEFT JOIN clinics cl ON cl.clinic_id = a.clinic_id AND a.facility_type = 'Clinic'
         ${where}
         ORDER BY a.appointment_datetime DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      query<{ total: number }[]>(
        `SELECT COUNT(*) AS total FROM appointments a ${where}`, params
      ),
    ]);

    const total = countRows[0]?.total ?? 0;
    return ok(appointments, undefined, { total, limit, offset, hasMore: offset + limit < total });
  } catch (err) {
    console.error('[Appointments GET]', err);
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Patient', 'Receptionist', 'Admin')) return forbidden();

  const body = await request.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON');

  const parsed = appointmentSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    );
  }

  const { doctor_id, facility_type, facility_id, appointment_datetime, reason_for_visit, symptoms, time_slot_id, is_emergency } = parsed.data;
  const emergencyBooking = hasRole(user, 'Patient') && is_emergency;

  try {
    const patient = await queryOne<{ id: number; user_id: number }>(
      'SELECT patient_id AS id, user_id FROM patients WHERE user_id = ?',
      [hasRole(user, 'Patient') ? user.userId : (body.patient_user_id ?? user.userId)]
    );
    if (!patient) return badRequest('Patient record not found');

    const existing = await queryOne(
      `SELECT appointment_id FROM appointments
       WHERE doctor_id = ? AND appointment_datetime = ? AND status NOT IN ('Cancelled', 'No-Show')`,
      [doctor_id, appointment_datetime]
    );
    if (existing) return badRequest('This time slot is already booked');

    // A patient cannot be in two places at once, even with different doctors.
    const clash = await queryOne(
      `SELECT appointment_id FROM appointments
       WHERE patient_id = ? AND appointment_datetime = ? AND status NOT IN ('Cancelled', 'No-Show')`,
      [patient.id, appointment_datetime]
    );
    if (clash) return conflict('You already have an appointment at this date and time');

    const doctor = await queryOne<{ consultation_fee: number; user_id: number }>(
      'SELECT consultation_fee, user_id FROM doctors WHERE doctor_id = ?', [doctor_id]
    );
    if (!doctor) return badRequest('Doctor not found');

    const hospitalId = facility_type === 'Hospital' ? facility_id : null;
    const clinicId = facility_type === 'Clinic' ? facility_id : null;
    const hospitalSlotId = (facility_type === 'Hospital' && time_slot_id) ? time_slot_id : null;
    const clinicSlotId = (facility_type === 'Clinic' && time_slot_id) ? time_slot_id : null;

    // The database has AFTER INSERT triggers on `appointments` (create_queue_entry,
    // update_hospital_slot_booked / update_clinic_slot_booked) that already create the
    // Waiting queue row and increment the slot's booked_count whenever an appointment is
    // inserted. This code must NOT also do either of those — doing so double-counts (a slot
    // reaches "full" after half its real capacity, and every booking gets two queue rows).
    // The only thing left for the app to do is the capacity CHECK, which the trigger doesn't
    // perform (it only reacts after the row exists) — done here under a row lock so two people
    // racing for the last place can't both get it.
    const slotTable = facility_type === 'Hospital' ? 'hospital_time_slots' : 'clinic_time_slots';

    const appointmentId = await transaction(async (conn) => {
      if (time_slot_id) {
        const [slotRows] = await conn.execute(
          `SELECT booked_count, max_patients, is_available FROM ${slotTable}
            WHERE slot_id = ? AND doctor_id = ? FOR UPDATE`,
          [time_slot_id, doctor_id]
        );
        const slot = (slotRows as { booked_count: number; max_patients: number; is_available: number }[])[0];
        if (!slot || !slot.is_available || slot.booked_count >= slot.max_patients) return null;
      }

      const [insertResult] = await conn.execute(
        `INSERT INTO appointments (patient_id, doctor_id, facility_type, hospital_id, clinic_id,
         hospital_slot_id, clinic_slot_id, appointment_datetime, status, reason, is_emergency)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Scheduled', ?, ?)`,
        [patient.id, doctor_id, facility_type, hospitalId, clinicId,
         hospitalSlotId, clinicSlotId, appointment_datetime, reason_for_visit ?? null, emergencyBooking ? 1 : 0]
      );
      return (insertResult as { insertId: number }).insertId;
    });

    if (appointmentId === null) {
      return conflict('That time slot is full or no longer available. Please choose another.');
    }

    // The create_queue_entry trigger already created the Waiting row for this appointment.
    const apptDate = appointment_datetime.slice(0, 10);
    const queueRow = await queryOne<{ id: number }>(
      'SELECT queue_id AS id FROM queue WHERE appointment_id = ?', [appointmentId]
    );

    // AI wait-time estimate for the new queue entry (best-effort: booking never fails because of it).
    const parsedHour = Number(appointment_datetime.slice(11, 13));
    const prediction = queueRow
      ? await predictForNewEntry({
          queueId: queueRow.id,
          doctorId: doctor_id,
          date: apptDate,
          hourOfDay: Number.isFinite(parsedHour) && appointment_datetime.length >= 13 ? parsedHour : new Date().getHours(),
        })
      : null;

    // Let every open queue screen know a patient has joined (real-time tracking, FR02).
    broadcastQueueUpdate(doctor_id, apptDate);
    emitQueueUpdate(doctor_id, apptDate);

    // Save symptoms if provided (best-effort)
    if (symptoms?.length) {
      const severityMap: Record<string, number> = { Mild: 1, Moderate: 2, Severe: 3 };
      for (const s of symptoms) {
        await query(
          `INSERT INTO patient_symptoms (patient_id, symptom_id, severity, duration_hours)
           VALUES (?, ?, ?, ?)`,
          [patient.id, s.symptom_id, severityMap[s.severity] ?? 1, (s.duration_days ?? 1) * 24]
        ).catch(() => null);
      }
    }

    // Send confirmation notification
    const patientUser = await queryOne<{ email: string; phone: string | null; full_name: string }>(
      'SELECT email, phone, full_name FROM users WHERE user_id = ?', [patient.user_id]
    );
    const doctorUser = await queryOne<{ full_name: string }>(
      'SELECT full_name FROM users WHERE user_id = ?', [doctor.user_id]
    );
    const facility = await queryOne<{ name: string }>(
      facility_type === 'Hospital'
        ? 'SELECT name FROM hospitals WHERE hospital_id = ?'
        : 'SELECT name FROM clinics WHERE clinic_id = ?',
      [facility_id]
    );

    if (patientUser && doctorUser && facility) {
      sendAppointmentConfirmation(
        patientUser.email,
        patientUser.phone,
        patient.user_id,
        appointmentId,
        {
          patientName: patientUser.full_name,
          doctorName: doctorUser.full_name,
          facilityName: facility.name,
          datetime: appointment_datetime,
        }
      ).catch(console.error);
    }

    return created(
      { appointmentId, isEmergency: emergencyBooking, estimated_wait_minutes: prediction?.minutes ?? null },
      'Appointment booked successfully'
    );
  } catch (err) {
    console.error('[Appointments POST]', err);
    return serverError();
  }
}
