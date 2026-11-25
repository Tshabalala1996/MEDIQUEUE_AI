import { NextRequest } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { ok, notFound, forbidden, serverError, badRequest, unauthorized } from '@/lib/response';
import { z } from 'zod';

const updateSchema = z.object({
  is_active: z.boolean().optional(),
  full_name: z.string().min(1).optional(),
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  phone: z.string().optional(),
  phone_number: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Admin')) return forbidden();

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON');

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return badRequest('Invalid fields');

  const updates: string[] = [];
  const vals: unknown[] = [];

  if (parsed.data.is_active !== undefined) { updates.push('is_active = ?'); vals.push(parsed.data.is_active ? 1 : 0); }
  if (parsed.data.full_name) { updates.push('full_name = ?'); vals.push(parsed.data.full_name); }
  else if (parsed.data.first_name || parsed.data.last_name) {
    // Accept first_name + last_name and combine into full_name
    const fullName = [parsed.data.first_name, parsed.data.last_name].filter(Boolean).join(' ');
    if (fullName) { updates.push('full_name = ?'); vals.push(fullName); }
  }
  if (parsed.data.phone) { updates.push('phone = ?'); vals.push(parsed.data.phone); }
  else if (parsed.data.phone_number) { updates.push('phone = ?'); vals.push(parsed.data.phone_number); }

  if (!updates.length) return badRequest('No fields to update');
  vals.push(id);

  try {
    const target = await queryOne('SELECT user_id FROM users WHERE user_id = ?', [id]);
    if (!target) return notFound('User not found');
    await query(`UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`, vals);
    return ok(null, 'User updated');
  } catch (err) {
    console.error('[Admin User PATCH]', err);
    return serverError();
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Admin')) return forbidden();

  const { id } = await params;
  try {
    await query('UPDATE users SET is_active = 0 WHERE user_id = ?', [id]);
    return ok(null, 'User deactivated');
  } catch (err) {
    console.error('[Admin User DELETE]', err);
    return serverError();
  }
}
