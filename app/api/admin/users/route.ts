import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { query, queryOne, transaction } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { ok, created, badRequest, conflict, forbidden, serverError, unauthorized, validationError } from '@/lib/response';
import { extractDOBFromID, extractGenderFromID, paginationSchema, staffSchema } from '@/lib/validators';

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Admin')) return forbidden();

  const { searchParams } = request.nextUrl;
  const { limit, offset } = paginationSchema.parse({
    limit: searchParams.get('limit'),
    offset: searchParams.get('offset'),
  });
  const role = searchParams.get('role');
  const search = searchParams.get('search');
  const is_active = searchParams.get('is_active');

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (search) {
    conditions.push('(u.full_name LIKE ? OR u.email LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (is_active !== null && is_active !== undefined && is_active !== '') { conditions.push('u.is_active = ?'); params.push(is_active === '1' ? 1 : 0); }
  if (role) { conditions.push('r.role_name = ?'); params.push(role); }

  const joinRole = role ? 'JOIN user_roles ur ON ur.user_id = u.user_id JOIN roles r ON r.role_id = ur.role_id'
    : 'LEFT JOIN user_roles ur ON ur.user_id = u.user_id LEFT JOIN roles r ON r.role_id = ur.role_id';
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [users, countRows] = await Promise.all([
      query<unknown[]>(
        `SELECT u.user_id AS id, u.email, SUBSTRING_INDEX(u.full_name, ' ', 1) AS first_name,
                SUBSTRING_INDEX(u.full_name, ' ', -1) AS last_name, u.phone AS phone_number, u.id_number,
                u.is_active, u.created_at,
                GROUP_CONCAT(r.role_name) AS roles
         FROM users u ${joinRole}
         ${where}
         GROUP BY u.user_id ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      query<{ total: number }[]>(
        `SELECT COUNT(DISTINCT u.user_id) AS total FROM users u ${joinRole} ${where}`, params
      ),
    ]);

    const total = countRows[0]?.total ?? 0;
    return ok(users, undefined, { total, limit, offset, hasMore: offset + limit < total });
  } catch (err) {
    console.error('[Admin Users GET]', err);
    return serverError();
  }
}

/**
 * Create a staff account (Nurse, Receptionist or Admin). Only an Admin can do this —
 * clinical and admin roles are deliberately not available through public registration.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Admin')) return forbidden();

  const body = await request.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON');

  const parsed = staffSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  const { email, password, first_name, last_name, phone_number, id_number, role } = parsed.data;

  try {
    const existing = await queryOne('SELECT user_id FROM users WHERE email = ? OR id_number = ?', [email, id_number]);
    if (existing) return conflict('An account with this email or ID number already exists');

    const roleRow = await queryOne<{ role_id: number }>('SELECT role_id FROM roles WHERE role_name = ?', [role]);
    if (!roleRow) return badRequest(`The ${role} role is not set up yet. Run "npm run db:migrate" first.`);

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = await transaction(async (conn) => {
      const [result] = await conn.execute(
        `INSERT INTO users (email, password_hash, full_name, phone, id_number, date_of_birth, gender)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [email, passwordHash, `${first_name} ${last_name}`, phone_number ?? null, id_number,
         extractDOBFromID(id_number), extractGenderFromID(id_number)]
      ) as [{ insertId: number }, unknown];
      await conn.execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [result.insertId, roleRow.role_id]);
      return result.insertId;
    });

    return created({ userId, email, role }, `${role} account created`);
  } catch (err) {
    console.error('[Admin Users POST]', err);
    return serverError();
  }
}
