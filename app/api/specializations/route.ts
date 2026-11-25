import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { ok, created, forbidden, serverError, badRequest, unauthorized } from '@/lib/response';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
});

export async function GET() {
  try {
    const specs = await query<unknown[]>(
      'SELECT specialization_id AS id, name, description FROM specializations ORDER BY name ASC'
    );
    return ok(specs);
  } catch (err) {
    console.error('[Specializations GET]', err);
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Admin')) return forbidden();

  const body = await request.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON');

  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest('name is required');

  const { name, description } = parsed.data;
  try {
    const result = await query<{ insertId: number }>(
      'INSERT INTO specializations (name, description) VALUES (?, ?)',
      [name, description ?? null]
    );
    return created({ id: (result as unknown as { insertId: number }).insertId }, 'Specialization created');
  } catch (err) {
    console.error('[Specializations POST]', err);
    return serverError();
  }
}
