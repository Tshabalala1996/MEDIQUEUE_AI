import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { ok, created, forbidden, serverError, badRequest, unauthorized } from '@/lib/response';
import { z } from 'zod';

const schema = z.object({
  doctor_id: z.number().positive(),
  facility_type: z.enum(['Hospital', 'Clinic']),
  facility_id: z.number().positive(),
  action: z.enum(['assign', 'unassign']).default('assign'),
});

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Admin', 'Receptionist')) return forbidden();

  const body = await request.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON');

  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest('doctor_id, facility_type, and facility_id are required');

  const { doctor_id, facility_type, facility_id, action } = parsed.data;
  const table = facility_type === 'Hospital' ? 'doctor_hospital_assignments' : 'doctor_clinic_assignments';
  const facilityCol = facility_type === 'Hospital' ? 'hospital_id' : 'clinic_id';

  try {
    if (action === 'assign') {
      await query(
        `INSERT IGNORE INTO ${table} (doctor_id, ${facilityCol}) VALUES (?, ?)`,
        [doctor_id, facility_id]
      );
      return created(null, `Doctor assigned to ${facility_type.toLowerCase()}`);
    } else {
      await query(
        `DELETE FROM ${table} WHERE doctor_id = ? AND ${facilityCol} = ?`,
        [doctor_id, facility_id]
      );
      return ok(null, `Doctor unassigned from ${facility_type.toLowerCase()}`);
    }
  } catch (err) {
    console.error('[AssignDoctor POST]', err);
    return serverError();
  }
}
