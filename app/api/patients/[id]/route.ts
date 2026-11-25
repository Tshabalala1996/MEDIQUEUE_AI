import { NextRequest } from 'next/server';
import { queryOne } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { ok, notFound, forbidden, serverError, unauthorized } from '@/lib/response';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();

  const { id } = await params;

  // Patients can only view their own profile
  if (hasRole(user, 'Patient')) {
    const self = await queryOne<{ id: number }>('SELECT patient_id AS id FROM patients WHERE user_id = ?', [user.userId]);
    if (!self || self.id !== Number(id)) return forbidden();
  } else if (!hasRole(user, 'Admin', 'Doctor', 'Receptionist')) {
    return forbidden();
  }

  try {
    const patient = await queryOne<Record<string, unknown>>(
      `SELECT p.patient_id AS id, p.user_id, p.medical_aid_provider, p.medical_aid_number,
              p.emergency_contact_name, p.emergency_contact_phone, p.blood_group AS blood_type, p.allergies,
              SUBSTRING_INDEX(u.full_name, ' ', 1) AS first_name, SUBSTRING_INDEX(u.full_name, ' ', -1) AS last_name,
              u.email, u.phone AS phone_number, u.id_number,
              u.date_of_birth, u.gender, NULL AS address, u.created_at
       FROM patients p JOIN users u ON u.user_id = p.user_id WHERE p.patient_id = ?`,
      [id]
    );
    if (!patient) return notFound('Patient not found');
    return ok(patient);
  } catch (err) {
    console.error('[Patient GET id]', err);
    return serverError();
  }
}
