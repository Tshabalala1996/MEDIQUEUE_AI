import { NextRequest } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { reviewSchema, paginationSchema } from '@/lib/validators';
import { ok, created, forbidden, serverError, badRequest, unauthorized, validationError } from '@/lib/response';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const { limit, offset } = paginationSchema.parse({
    limit: searchParams.get('limit'),
    offset: searchParams.get('offset'),
  });

  const doctor_id = searchParams.get('doctor_id');
  const hospital_id = searchParams.get('hospital_id');
  const clinic_id = searchParams.get('clinic_id');

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (doctor_id) { conditions.push('r.doctor_id = ?'); params.push(Number(doctor_id)); }
  if (hospital_id) { conditions.push('r.hospital_id = ?'); params.push(Number(hospital_id)); }
  if (clinic_id) { conditions.push('r.clinic_id = ?'); params.push(Number(clinic_id)); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [reviews, countRows] = await Promise.all([
      query<unknown[]>(
        `SELECT r.review_id AS id, r.rating, r.comment, r.created_at,
                u.full_name AS reviewer_name
         FROM reviews r
         JOIN patients p ON p.patient_id = r.patient_id
         JOIN users u ON u.user_id = p.user_id
         ${where}
         ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      query<{ total: number }[]>(`SELECT COUNT(*) AS total FROM reviews r ${where}`, params),
    ]);

    const total = countRows[0]?.total ?? 0;
    return ok(reviews, undefined, { total, limit, offset, hasMore: offset + limit < total });
  } catch (err) {
    console.error('[Reviews GET]', err);
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Patient')) return forbidden('Only patients can leave reviews');

  const body = await request.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON');

  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }

  const { doctor_id, hospital_id, clinic_id, rating, comment } = parsed.data;

  if (!doctor_id && !hospital_id && !clinic_id) {
    return badRequest('Must review a doctor, hospital, or clinic');
  }

  const patient = await queryOne<{ id: number }>(
    'SELECT patient_id AS id FROM patients WHERE user_id = ?', [user.userId]
  );
  if (!patient) return forbidden('Patient record not found');

  try {
    const result = await query<{ insertId: number }>(
      `INSERT INTO reviews (patient_id, doctor_id, hospital_id, clinic_id, rating, comment)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [patient.id, doctor_id ?? null, hospital_id ?? null, clinic_id ?? null, rating, comment ?? null]
    );
    return created({ id: (result as unknown as { insertId: number }).insertId }, 'Review submitted');
  } catch (err) {
    console.error('[Reviews POST]', err);
    return serverError();
  }
}
