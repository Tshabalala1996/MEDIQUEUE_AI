import { NextRequest } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { ok, created, forbidden, serverError, badRequest, unauthorized } from '@/lib/response';
import { z } from 'zod';
import { sendBillNotification } from '@/lib/notifications';

const createSchema = z.object({
  appointment_id: z.number().positive(),
  file_fee: z.number().min(0).default(0),
  service_fee: z.number().min(0).default(0),
  patient_category: z.enum(['Indigent', 'H1', 'H2', 'H3', 'Private']).default('H1'),
  notes: z.string().max(1000).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();

  const { searchParams } = request.nextUrl;
  const appointment_id = searchParams.get('appointment_id');
  const patient_id = searchParams.get('patient_id');

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (hasRole(user, 'Patient')) {
    const patient = await queryOne<{ id: number }>(
      'SELECT patient_id AS id FROM patients WHERE user_id = ?', [user.userId]
    );
    if (!patient) return ok([]);
    conditions.push('b.patient_id = ?');
    params.push(patient.id);
  } else {
    if (appointment_id) { conditions.push('b.appointment_id = ?'); params.push(Number(appointment_id)); }
    if (patient_id) { conditions.push('b.patient_id = ?'); params.push(Number(patient_id)); }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const bills = await query<unknown[]>(
      `SELECT b.bill_id AS id, b.appointment_id, b.patient_id, b.file_fee, b.service_fee,
              b.total_amount, b.patient_category, b.status, b.notes, b.created_at,
              pu.full_name AS patient_name, pu.email AS patient_email, pu.phone AS patient_phone,
              du.full_name AS doctor_name,
              COALESCE(h.name, cl.name) AS facility_name,
              a.appointment_datetime, a.status AS appointment_status
       FROM billing b
       JOIN appointments a ON a.appointment_id = b.appointment_id
       JOIN patients p ON p.patient_id = b.patient_id
       JOIN users pu ON pu.user_id = p.user_id
       JOIN doctors d ON d.doctor_id = a.doctor_id
       JOIN users du ON du.user_id = d.user_id
       LEFT JOIN hospitals h ON h.hospital_id = a.hospital_id AND a.facility_type = 'Hospital'
       LEFT JOIN clinics cl ON cl.clinic_id = a.clinic_id AND a.facility_type = 'Clinic'
       ${where}
       ORDER BY b.created_at DESC`,
      params
    );
    return ok(bills);
  } catch (err) {
    console.error('[Billing GET]', err);
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Receptionist', 'Admin', 'Doctor')) return forbidden();

  const body = await request.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON');

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Validation failed');

  const { appointment_id, file_fee, service_fee, patient_category, notes } = parsed.data;

  try {
    // Get appointment + patient details
    const appt = await queryOne<{
      patient_id: number; patient_name: string; patient_email: string; patient_phone: string | null;
      user_id: number; doctor_name: string; facility_name: string; appointment_datetime: string;
    }>(
      `SELECT a.patient_id, pu.full_name AS patient_name, pu.email AS patient_email,
              pu.phone AS patient_phone, p.user_id,
              du.full_name AS doctor_name,
              COALESCE(h.name, cl.name) AS facility_name,
              a.appointment_datetime
       FROM appointments a
       JOIN patients p ON p.patient_id = a.patient_id
       JOIN users pu ON pu.user_id = p.user_id
       JOIN doctors d ON d.doctor_id = a.doctor_id
       JOIN users du ON du.user_id = d.user_id
       LEFT JOIN hospitals h ON h.hospital_id = a.hospital_id AND a.facility_type = 'Hospital'
       LEFT JOIN clinics cl ON cl.clinic_id = a.clinic_id AND a.facility_type = 'Clinic'
       WHERE a.appointment_id = ?`,
      [appointment_id]
    );
    if (!appt) return badRequest('Appointment not found');

    // Check if bill already exists
    const existing = await queryOne<{ id: number }>(
      'SELECT bill_id AS id FROM billing WHERE appointment_id = ?', [appointment_id]
    );
    if (existing) return badRequest('A bill already exists for this appointment');

    const insertResult = await query<{ insertId: number }>(
      `INSERT INTO billing (appointment_id, patient_id, file_fee, service_fee, patient_category, notes, processed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [appointment_id, appt.patient_id, file_fee, service_fee, patient_category, notes ?? null, user.userId]
    );
    const billId = (insertResult as unknown as { insertId: number }).insertId;

    // Mark bill as Sent and notify patient
    await query(`UPDATE billing SET status = 'Sent' WHERE bill_id = ?`, [billId]);
    const total = file_fee + service_fee;

    sendBillNotification(
      appt.patient_email,
      appt.patient_phone,
      appt.user_id,
      billId,
      {
        patientName: appt.patient_name,
        doctorName: appt.doctor_name,
        facilityName: appt.facility_name,
        appointmentDatetime: appt.appointment_datetime,
        fileFee: file_fee,
        serviceFee: service_fee,
        totalAmount: total,
        patientCategory: patient_category,
      }
    ).catch(console.error);

    return created({ billId, totalAmount: total }, 'Bill created and sent to patient');
  } catch (err) {
    console.error('[Billing POST]', err);
    return serverError();
  }
}
