import { NextRequest } from 'next/server';
import { queryOne, query } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { ok, notFound, forbidden, serverError, badRequest } from '@/lib/response';
import { z } from 'zod';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const doctor = await queryOne<Record<string, unknown>>(
      `SELECT d.doctor_id AS id, d.user_id, d.hpcs_registration_number AS hpcsa_number, d.practice_number, d.specialization_id,
              d.consultation_fee, d.years_of_experience, d.bio, d.rating_avg AS average_rating, 0 AS total_reviews,
              SUBSTRING_INDEX(u.full_name, ' ', 1) AS first_name, SUBSTRING_INDEX(u.full_name, ' ', -1) AS last_name,
              u.email, u.phone AS phone_number, NULL AS profile_picture, u.gender,
              s.name AS specialization_name, s.description AS specialization_description
       FROM doctors d
       JOIN users u ON u.user_id = d.user_id
       JOIN specializations s ON s.specialization_id = d.specialization_id
       WHERE d.doctor_id = ? AND u.is_active = 1`,
      [id]
    );
    if (!doctor) return notFound('Doctor not found');

    const [hospitals, clinics] = await Promise.all([
      query<unknown[]>(
        `SELECT h.hospital_id AS id, h.name, h.facility_type AS type, h.province, h.city, h.address_line1 AS address
         FROM hospitals h
         JOIN doctor_hospital_assignments dha ON dha.hospital_id = h.hospital_id
         WHERE dha.doctor_id = ? AND h.is_active = 1`,
        [id]
      ),
      query<unknown[]>(
        `SELECT c.clinic_id AS id, c.name, c.clinic_type AS type, c.province, c.city, c.address_line1 AS address
         FROM clinics c
         JOIN doctor_clinic_assignments dca ON dca.clinic_id = c.clinic_id
         WHERE dca.doctor_id = ? AND c.is_active = 1`,
        [id]
      ),
    ]);

    return ok({ ...doctor, hospitals, clinics });
  } catch (err) {
    console.error('[Doctor GET id]', err);
    return serverError();
  }
}

const updateSchema = z.object({
  bio: z.string().optional(),
  consultation_fee: z.number().positive().optional(),
  years_of_experience: z.number().nonnegative().optional(),
  is_available: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request);
  if (!user) return forbidden();

  const { id } = await params;

  // Doctors can only edit their own profile; Admin can edit any
  if (!hasRole(user, 'Admin')) {
    const doctorRow = await queryOne<{ user_id: number }>(
      'SELECT user_id FROM doctors WHERE doctor_id = ?', [id]
    );
    if (!doctorRow || doctorRow.user_id !== user.userId) return forbidden();
  }

  const body = await request.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON');

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return badRequest('Invalid fields');

  const { bio, consultation_fee, years_of_experience, is_available } = parsed.data;
  const updates: string[] = [];
  const vals: unknown[] = [];

  if (bio !== undefined) { updates.push('bio = ?'); vals.push(bio); }
  if (consultation_fee !== undefined) { updates.push('consultation_fee = ?'); vals.push(consultation_fee); }
  if (years_of_experience !== undefined) { updates.push('years_of_experience = ?'); vals.push(years_of_experience); }
  // Was accepted by the schema but silently dropped here — the emergency routing tiers
  // (lib/emergencyRouting.ts) now depend on this flag, so it needs to be settable.
  if (is_available !== undefined) { updates.push('is_available = ?'); vals.push(is_available ? 1 : 0); }

  if (!updates.length) return badRequest('No fields to update');
  vals.push(id);

  try {
    await query(`UPDATE doctors SET ${updates.join(', ')} WHERE doctor_id = ?`, vals);
    return ok(null, 'Doctor profile updated');
  } catch (err) {
    console.error('[Doctor PATCH]', err);
    return serverError();
  }
}
