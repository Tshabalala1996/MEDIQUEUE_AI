import { NextRequest } from 'next/server';
import { queryOne, query } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { clinicSchema } from '@/lib/validators';
import { ok, notFound, forbidden, serverError, badRequest, unauthorized } from '@/lib/response';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const clinic = await queryOne<Record<string, unknown>>(
      'SELECT * FROM clinics WHERE clinic_id = ? AND is_active = 1', [id]
    );
    if (!clinic) return notFound('Clinic not found');

    const doctors = await query<unknown[]>(
      `SELECT d.doctor_id AS id, SUBSTRING_INDEX(u.full_name, ' ', 1) AS first_name,
              SUBSTRING_INDEX(u.full_name, ' ', -1) AS last_name, s.name AS specialization_name,
              d.consultation_fee, d.rating_avg AS average_rating
       FROM doctors d
       JOIN doctor_clinic_assignments dca ON dca.doctor_id = d.doctor_id
       JOIN users u ON u.user_id = d.user_id
       JOIN specializations s ON s.specialization_id = d.specialization_id
       WHERE dca.clinic_id = ? AND u.is_active = 1`,
      [id]
    );
    return ok({ ...clinic, doctors });
  } catch (err) {
    console.error('[Clinic GET id]', err);
    return serverError();
  }
}

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

  const parsed = clinicSchema.partial().safeParse(body);
  if (!parsed.success) return badRequest('Invalid fields');

  // Map schema field names to actual DB column names
  const columnMap: Record<string, string> = {
    name: 'name',
    type: 'clinic_type',
    province: 'province',
    city: 'city',
    address: 'address_line1',
    phone_number: 'phone',
    email: 'email',
    latitude: 'latitude',
    longitude: 'longitude',
  };

  const entries = Object.entries(parsed.data).filter(([, v]) => v !== undefined);
  const updates = entries.map(([k]) => `${columnMap[k] ?? k} = ?`);
  const vals = [...entries.map(([, v]) => v), id];
  if (!updates.length) return badRequest('No fields to update');

  try {
    await query(`UPDATE clinics SET ${updates.join(', ')} WHERE clinic_id = ?`, vals);
    return ok(null, 'Clinic updated');
  } catch (err) {
    console.error('[Clinic PATCH]', err);
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
    await query('UPDATE clinics SET is_active = 0 WHERE clinic_id = ?', [id]);
    return ok(null, 'Clinic deactivated');
  } catch (err) {
    console.error('[Clinic DELETE]', err);
    return serverError();
  }
}
