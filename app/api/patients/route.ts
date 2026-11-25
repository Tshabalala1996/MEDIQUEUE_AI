import { NextRequest } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { paginationSchema } from '@/lib/validators';
import { ok, forbidden, serverError, unauthorized } from '@/lib/response';

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Admin', 'Doctor', 'Receptionist')) return forbidden();

  const { searchParams } = request.nextUrl;
  const { limit, offset } = paginationSchema.parse({
    limit: searchParams.get('limit'),
    offset: searchParams.get('offset'),
  });
  const search = searchParams.get('search');

  const conditions: string[] = ['u.is_active = 1'];
  const params: unknown[] = [];

  if (search) {
    conditions.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.id_number LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  try {
    const [patients, countRows] = await Promise.all([
      query<unknown[]>(
        `SELECT p.patient_id AS id, p.user_id, p.medical_aid_provider, p.medical_aid_number,
                p.emergency_contact_name, p.emergency_contact_phone, p.blood_group AS blood_type, p.allergies,
                SUBSTRING_INDEX(u.full_name, ' ', 1) AS first_name, SUBSTRING_INDEX(u.full_name, ' ', -1) AS last_name,
                u.email, u.phone AS phone_number, u.id_number,
                u.date_of_birth, u.gender, u.created_at
         FROM patients p JOIN users u ON u.user_id = p.user_id
         ${where} ORDER BY u.full_name ASC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      query<{ total: number }[]>(
        `SELECT COUNT(*) AS total FROM patients p JOIN users u ON u.user_id = p.user_id ${where}`, params
      ),
    ]);

    const total = countRows[0]?.total ?? 0;
    return ok(patients, undefined, { total, limit, offset, hasMore: offset + limit < total });
  } catch (err) {
    console.error('[Patients GET]', err);
    return serverError();
  }
}
