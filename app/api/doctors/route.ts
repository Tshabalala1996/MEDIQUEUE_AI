import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { ok, serverError } from '@/lib/response';
import { paginationSchema } from '@/lib/validators';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const pagination = paginationSchema.safeParse({
    limit: searchParams.get('limit'),
    offset: searchParams.get('offset'),
  });
  const { limit, offset } = pagination.success ? pagination.data : { limit: 20, offset: 0 };

  const specialization_id = searchParams.get('specialization_id');
  const province = searchParams.get('province');
  const city = searchParams.get('city');
  const facility_type = searchParams.get('facility_type'); // 'Hospital' | 'Clinic'
  const facility_id = searchParams.get('facility_id');
  const min_fee = searchParams.get('min_fee');
  const max_fee = searchParams.get('max_fee');
  const min_rating = searchParams.get('min_rating');
  const search = searchParams.get('search');

  const conditions: string[] = ['d.user_id IS NOT NULL', 'u.is_active = 1'];
  const params: unknown[] = [];

  if (specialization_id) { conditions.push('d.specialization_id = ?'); params.push(Number(specialization_id)); }
  if (province) { conditions.push('(h.province = ? OR cl.province = ?)'); params.push(province, province); }
  if (city) { conditions.push('(h.city LIKE ? OR cl.city LIKE ?)'); params.push(`%${city}%`, `%${city}%`); }
  if (min_fee) { conditions.push('d.consultation_fee >= ?'); params.push(Number(min_fee)); }
  if (max_fee) { conditions.push('d.consultation_fee <= ?'); params.push(Number(max_fee)); }
  if (min_rating) { conditions.push('d.rating_avg >= ?'); params.push(Number(min_rating)); }
  if (search) {
    conditions.push('(u.full_name LIKE ? OR s.name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  let facilityJoin = `
    LEFT JOIN doctor_hospital_assignments dha ON dha.doctor_id = d.doctor_id
    LEFT JOIN hospitals h ON h.hospital_id = dha.hospital_id
    LEFT JOIN doctor_clinic_assignments dca ON dca.doctor_id = d.doctor_id
    LEFT JOIN clinics cl ON cl.clinic_id = dca.clinic_id
  `;

  if (facility_type === 'Hospital' && facility_id) {
    conditions.push('dha.hospital_id = ?');
    params.push(Number(facility_id));
  } else if (facility_type === 'Clinic' && facility_id) {
    conditions.push('dca.clinic_id = ?');
    params.push(Number(facility_id));
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [doctors, countRows] = await Promise.all([
      query<unknown[]>(
        `SELECT DISTINCT d.doctor_id, d.doctor_id AS id, d.user_id, d.hpcs_registration_number AS hpcsa_number, d.practice_number, d.specialization_id,
                d.consultation_fee, d.years_of_experience, d.bio, d.rating_avg AS average_rating, 0 AS total_reviews,
                u.full_name,
                TRIM(SUBSTRING_INDEX(TRIM(REPLACE(REPLACE(u.full_name,'Dr. ',''),'Dr ','')),' ',1)) AS first_name,
                TRIM(SUBSTRING_INDEX(TRIM(REPLACE(REPLACE(u.full_name,'Dr. ',''),'Dr ','')),' ',-1)) AS last_name,
                u.email, u.phone AS phone_number, NULL AS profile_picture,
                s.name AS specialization_name
         FROM doctors d
         JOIN users u ON u.user_id = d.user_id
         JOIN specializations s ON s.specialization_id = d.specialization_id
         ${facilityJoin}
         ${where}
         ORDER BY d.rating_avg DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      query<{ total: number }[]>(
        `SELECT COUNT(DISTINCT d.doctor_id) AS total
         FROM doctors d
         JOIN users u ON u.user_id = d.user_id
         JOIN specializations s ON s.specialization_id = d.specialization_id
         ${facilityJoin}
         ${where}`,
        params
      ),
    ]);

    const total = countRows[0]?.total ?? 0;
    return ok(doctors, undefined, { total, limit, offset, hasMore: offset + limit < total });
  } catch (err) {
    console.error('[Doctors GET]', err);
    return serverError();
  }
}
