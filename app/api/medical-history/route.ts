import { NextRequest } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { medicalHistorySchema, paginationSchema } from '@/lib/validators';
import { ok, created, forbidden, serverError, badRequest, unauthorized, validationError } from '@/lib/response';

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();

  const { searchParams } = request.nextUrl;
  const { limit, offset } = paginationSchema.parse({
    limit: searchParams.get('limit'),
    offset: searchParams.get('offset'),
  });
  const patient_id = searchParams.get('patient_id');

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (hasRole(user, 'Patient')) {
    const patient = await queryOne<{ id: number }>(
      'SELECT patient_id AS id FROM patients WHERE user_id = ?', [user.userId]
    );
    if (!patient) return forbidden();
    conditions.push('mh.patient_id = ?');
    params.push(patient.id);
  } else if (patient_id) {
    conditions.push('mh.patient_id = ?');
    params.push(Number(patient_id));
  } else if (hasRole(user, 'Doctor')) {
    const doctor = await queryOne<{ id: number }>('SELECT doctor_id AS id FROM doctors WHERE user_id = ?', [user.userId]);
    if (doctor) { conditions.push('mh.recorded_by = ?'); params.push(doctor.id); }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [history, countRows] = await Promise.all([
      query<unknown[]>(
        `SELECT mh.history_id AS id, mh.patient_id, mh.appointment_id, mh.recorded_by AS doctor_id,
                mh.diagnosis, mh.prescription, mh.notes, mh.record_date AS visit_date,
                du.full_name AS doctor_name
         FROM medical_history mh
         LEFT JOIN doctors d ON d.doctor_id = mh.recorded_by
         LEFT JOIN users du ON du.user_id = d.user_id
         ${where}
         ORDER BY mh.record_date DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      query<{ total: number }[]>(`SELECT COUNT(*) AS total FROM medical_history mh ${where}`, params),
    ]);

    const total = countRows[0]?.total ?? 0;
    return ok(history, undefined, { total, limit, offset, hasMore: offset + limit < total });
  } catch (err) {
    console.error('[MedicalHistory GET]', err);
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Doctor', 'Admin')) return forbidden('Only doctors can add medical history');

  const body = await request.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON');

  const parsed = medicalHistorySchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }

  const { patient_id, appointment_id, diagnosis, prescription, notes, visit_date } = parsed.data;

  let doctorId: number | null = null;
  if (hasRole(user, 'Doctor')) {
    const doc = await queryOne<{ id: number }>('SELECT doctor_id AS id FROM doctors WHERE user_id = ?', [user.userId]);
    doctorId = doc?.id ?? null;
  }

  try {
    const result = await query<{ insertId: number }>(
      `INSERT INTO medical_history (patient_id, appointment_id, recorded_by, diagnosis, prescription, notes, record_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [patient_id, appointment_id ?? null, doctorId, diagnosis, prescription ?? null, notes ?? null, visit_date]
    );
    return created({ id: (result as unknown as { insertId: number }).insertId }, 'Medical record added');
  } catch (err) {
    console.error('[MedicalHistory POST]', err);
    return serverError();
  }
}
