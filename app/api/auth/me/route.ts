import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { queryOne, query } from '@/lib/db';
import { ok, unauthorized, serverError } from '@/lib/response';

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();

  try {
    const profile = await queryOne<{
      id: number; email: string; full_name: string; phone: string | null;
      id_number: string; date_of_birth: string | null; gender: string | null;
      is_active: boolean; created_at: string;
    }>(
      `SELECT user_id AS id, email, full_name, phone, id_number,
              date_of_birth, gender, is_active, created_at
       FROM users WHERE user_id = ?`,
      [user.userId]
    );
    if (!profile) return unauthorized();

    const roles = await query<{ name: string }[]>(
      `SELECT r.role_name AS name FROM roles r
       JOIN user_roles ur ON ur.role_id = r.role_id WHERE ur.user_id = ?`,
      [user.userId]
    );

    const [firstName, ...rest] = profile.full_name.split(' ');
    return ok({
      ...profile,
      first_name: firstName,
      last_name: rest.join(' '),
      roles: roles.map((r) => r.name),
    });
  } catch (err) {
    console.error('[Me]', err);
    return serverError();
  }
}
