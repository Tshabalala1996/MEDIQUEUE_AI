import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { hospitalSchema, paginationSchema } from '@/lib/validators';
import { ok, created, forbidden, serverError, badRequest, unauthorized, validationError } from '@/lib/response';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const { limit, offset } = paginationSchema.parse({
    limit: searchParams.get('limit'),
    offset: searchParams.get('offset'),
  });

  const conditions: string[] = ['h.is_active = 1'];
  const params: unknown[] = [];

  const province = searchParams.get('province');
  const city = searchParams.get('city');
  const type = searchParams.get('type');
  const search = searchParams.get('search');

  if (province) { conditions.push('h.province = ?'); params.push(province); }
  if (city) { conditions.push('h.city LIKE ?'); params.push(`%${city}%`); }
  if (type === 'Public') {
    conditions.push("h.facility_type IN ('Public Hospital','District Hospital','Regional Hospital','Tertiary Hospital','Central Hospital','Community Health Centre')");
  } else if (type === 'Private') {
    conditions.push("h.facility_type = 'Private Hospital'");
  } else if (type) {
    conditions.push('h.facility_type = ?'); params.push(type);
  }
  if (search) { conditions.push('h.name LIKE ?'); params.push(`%${search}%`); }

  const where = `WHERE ${conditions.join(' AND ')}`;

  try {
    const [hospitals, countRows] = await Promise.all([
      query<unknown[]>(
        `SELECT h.hospital_id AS id, h.name, h.facility_type AS type, h.province, h.city, h.address_line1 AS address,
                h.phone AS phone_number, h.email, h.latitude, h.longitude, h.rating_avg AS average_rating
         FROM hospitals h ${where} ORDER BY h.name ASC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      query<{ total: number }[]>(`SELECT COUNT(*) AS total FROM hospitals h ${where}`, params),
    ]);

    const total = countRows[0]?.total ?? 0;
    return ok(hospitals, undefined, { total, limit, offset, hasMore: offset + limit < total });
  } catch (err) {
    console.error('[Hospitals GET]', err);
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Admin')) return forbidden();

  const body = await request.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON');

  const parsed = hospitalSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }

  const { name, type, province, city, address, phone_number, email, latitude, longitude } = parsed.data;
  try {
    const result = await query<{ insertId: number }>(
      `INSERT INTO hospitals (name, facility_type, province, city, address_line1, phone, email, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, type, province, city, address, phone_number ?? null, email ?? null, latitude ?? null, longitude ?? null]
    );
    return created({ id: (result as unknown as { insertId: number }).insertId }, 'Hospital created');
  } catch (err) {
    console.error('[Hospitals POST]', err);
    return serverError();
  }
}
