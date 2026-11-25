import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { clinicSchema, paginationSchema } from '@/lib/validators';
import { ok, created, forbidden, serverError, badRequest, unauthorized, validationError } from '@/lib/response';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const { limit, offset } = paginationSchema.parse({
    limit: searchParams.get('limit'),
    offset: searchParams.get('offset'),
  });

  const conditions: string[] = ['c.is_active = 1'];
  const params: unknown[] = [];

  const province = searchParams.get('province');
  const city = searchParams.get('city');
  const type = searchParams.get('type');
  const search = searchParams.get('search');

  if (province) { conditions.push('c.province = ?'); params.push(province); }
  if (city) { conditions.push('c.city LIKE ?'); params.push(`%${city}%`); }
  if (type) { conditions.push('c.clinic_type = ?'); params.push(type); }
  if (search) { conditions.push('c.name LIKE ?'); params.push(`%${search}%`); }

  const where = `WHERE ${conditions.join(' AND ')}`;

  try {
    const [clinics, countRows] = await Promise.all([
      query<unknown[]>(
        `SELECT c.clinic_id AS id, c.name, c.clinic_type AS type, c.province, c.city, c.address_line1 AS address,
                c.phone AS phone_number, c.email, c.latitude, c.longitude, c.rating_avg AS average_rating
         FROM clinics c ${where} ORDER BY c.name ASC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      query<{ total: number }[]>(`SELECT COUNT(*) AS total FROM clinics c ${where}`, params),
    ]);

    const total = countRows[0]?.total ?? 0;
    return ok(clinics, undefined, { total, limit, offset, hasMore: offset + limit < total });
  } catch (err) {
    console.error('[Clinics GET]', err);
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Admin')) return forbidden();

  const body = await request.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON');

  const parsed = clinicSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }

  const { name, type, province, city, address, phone_number, email, latitude, longitude } = parsed.data;
  try {
    const result = await query<{ insertId: number }>(
      `INSERT INTO clinics (name, clinic_type, province, city, address_line1, phone, email, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, type, province, city, address, phone_number ?? null, email ?? null, latitude ?? null, longitude ?? null]
    );
    return created({ id: (result as unknown as { insertId: number }).insertId }, 'Clinic created');
  } catch (err) {
    console.error('[Clinics POST]', err);
    return serverError();
  }
}
