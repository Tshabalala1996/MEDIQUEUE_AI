import { NextRequest } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { ok, forbidden, serverError, unauthorized } from '@/lib/response';

/**
 * GET /api/doctors/my-facilities?type=Hospital|Clinic
 * Returns facilities (hospitals or clinics) the authenticated doctor is assigned to.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Doctor', 'Admin')) return forbidden();

  const type = request.nextUrl.searchParams.get('type'); // 'Hospital' | 'Clinic'

  try {
    let doctorId: number;
    if (hasRole(user, 'Doctor')) {
      const doc = await queryOne<{ id: number }>(
        'SELECT doctor_id AS id FROM doctors WHERE user_id = ?', [user.userId]
      );
      if (!doc) return ok([]);
      doctorId = doc.id;
    } else {
      // Admin: pass doctor_id param
      const paramId = request.nextUrl.searchParams.get('doctor_id');
      if (!paramId) return ok([]);
      doctorId = Number(paramId);
    }

    let facilities: unknown[] = [];

    if (!type || type === 'Hospital') {
      const hospitals = await query<unknown[]>(
        `SELECT h.hospital_id AS id, h.name, 'Hospital' AS type, h.province, h.city
         FROM hospitals h
         JOIN doctor_hospital_assignments dha ON dha.hospital_id = h.hospital_id
         WHERE dha.doctor_id = ? AND h.is_active = 1
         ORDER BY h.name ASC`,
        [doctorId]
      );
      facilities = [...facilities, ...hospitals];
    }

    if (!type || type === 'Clinic') {
      const clinics = await query<unknown[]>(
        `SELECT c.clinic_id AS id, c.name, 'Clinic' AS type, c.province, c.city
         FROM clinics c
         JOIN doctor_clinic_assignments dca ON dca.clinic_id = c.clinic_id
         WHERE dca.doctor_id = ? AND c.is_active = 1
         ORDER BY c.name ASC`,
        [doctorId]
      );
      facilities = [...facilities, ...clinics];
    }

    return ok(facilities);
  } catch (err) {
    console.error('[Doctor My-Facilities GET]', err);
    return serverError();
  }
}
