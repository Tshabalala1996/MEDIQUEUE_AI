import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { ok, unauthorized, serverError } from '@/lib/response';
import { paginationSchema } from '@/lib/validators';

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();

  const { searchParams } = request.nextUrl;
  const { limit, offset } = paginationSchema.parse({
    limit: searchParams.get('limit'),
    offset: searchParams.get('offset'),
  });

  try {
    const notifications = await query<unknown[]>(
      `SELECT id, appointment_id, type, message, status, sent_at, created_at
       FROM notifications WHERE user_id = ?
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [user.userId, limit, offset]
    );
    return ok(notifications);
  } catch (err) {
    console.error('[Notifications GET]', err);
    return serverError();
  }
}
