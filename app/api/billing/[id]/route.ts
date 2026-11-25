import { NextRequest } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { ok, forbidden, notFound, serverError, badRequest, unauthorized } from '@/lib/response';
import { z } from 'zod';

const patchSchema = z.object({
  status: z.enum(['Paid', 'Waived']).optional(),
  file_fee: z.number().min(0).optional(),
  service_fee: z.number().min(0).optional(),
  notes: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Receptionist', 'Admin')) return forbidden();

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON');

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest('Invalid fields');

  const { status, file_fee, service_fee, notes } = parsed.data;
  const updates: string[] = [];
  const vals: unknown[] = [];

  if (status !== undefined) { updates.push('status = ?'); vals.push(status); }
  if (file_fee !== undefined) { updates.push('file_fee = ?'); vals.push(file_fee); }
  if (service_fee !== undefined) { updates.push('service_fee = ?'); vals.push(service_fee); }
  if (notes !== undefined) { updates.push('notes = ?'); vals.push(notes); }

  if (!updates.length) return badRequest('No fields to update');
  vals.push(id);

  try {
    const bill = await queryOne('SELECT bill_id FROM billing WHERE bill_id = ?', [id]);
    if (!bill) return notFound('Bill not found');

    await query(`UPDATE billing SET ${updates.join(', ')} WHERE bill_id = ?`, vals);
    return ok(null, 'Bill updated');
  } catch (err) {
    console.error('[Billing PATCH]', err);
    return serverError();
  }
}
