import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { queryOne, query } from '@/lib/db';
import { signAccessToken, signRefreshToken, setRefreshCookie } from '@/lib/auth';
import { loginSchema } from '@/lib/validators';
import { ok, badRequest, unauthorized, serverError, validationError } from '@/lib/response';
import { rateLimit } from '@/lib/ratelimit';
import { cookies } from 'next/headers';
import type { Role } from '@/types';

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const { allowed } = rateLimit(`login:${ip}`);
  if (!allowed) return badRequest('Too many login attempts. Please try again later.');

  const body = await request.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON body');

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    );
  }

  const { email, password } = parsed.data;

  try {
    const user = await queryOne<{
      id: number; email: string; password_hash: string; full_name: string; is_active: boolean;
    }>('SELECT user_id AS id, email, password_hash, full_name, is_active FROM users WHERE email = ?', [email]);

    if (!user) return unauthorized('Invalid email or password');
    if (!user.is_active) return unauthorized('Account is disabled. Contact support.');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return unauthorized('Invalid email or password');

    const roleRows = await query<{ name: string }[]>(
      `SELECT r.role_name AS name FROM roles r
       JOIN user_roles ur ON ur.role_id = r.role_id
       WHERE ur.user_id = ?`,
      [user.id]
    );
    const roles = roleRows.map((r) => r.name) as Role[];

    const jwtPayload = { userId: user.id, email: user.email, roles };
    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken(jwtPayload),
      signRefreshToken(jwtPayload),
    ]);

    await setRefreshCookie(refreshToken);

    const cookieStore = await cookies();
    cookieStore.set('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60,
      path: '/',
    });

    const [firstName, ...rest] = user.full_name.split(' ');
    return ok(
      {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          first_name: firstName,
          last_name: rest.join(' '),
          roles,
        },
      },
      'Login successful'
    );
  } catch (err) {
    console.error('[Login]', err);
    return serverError();
  }
}
