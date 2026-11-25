import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { query, queryOne, transaction } from '@/lib/db';
import { signAccessToken, signRefreshToken, setRefreshCookie } from '@/lib/auth';
import { registerSchema } from '@/lib/validators';
import { created, badRequest, conflict, serverError, validationError } from '@/lib/response';
import { rateLimit } from '@/lib/ratelimit';
import { extractDOBFromID, extractGenderFromID } from '@/lib/validators';

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const { allowed } = rateLimit(`register:${ip}`);
  if (!allowed) return badRequest('Too many requests. Please try again later.');

  const body = await request.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON body');

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    );
  }

  const {
    email, password, first_name, last_name, phone_number, id_number, role,
    medical_aid_provider, medical_aid_number, emergency_contact_name, emergency_contact_phone,
    blood_type, allergies, hpcsa_number, practice_number, specialization_id,
    consultation_fee, years_of_experience, bio,
  } = parsed.data;

  try {
    const existing = await queryOne('SELECT user_id FROM users WHERE email = ? OR id_number = ?', [email, id_number]);
    if (existing) return conflict('An account with this email or ID number already exists');

    // Get role ID
    const roleRow = await queryOne<{ role_id: number }>('SELECT role_id FROM roles WHERE role_name = ?', [role]);
    if (!roleRow) return badRequest('Invalid role');

    const passwordHash = await bcrypt.hash(password, 12);
    const dob = extractDOBFromID(id_number);
    const gender = extractGenderFromID(id_number);

    const userId = await transaction(async (conn) => {
      const [userResult] = await conn.execute(
        `INSERT INTO users (email, password_hash, full_name, phone, id_number, date_of_birth, gender)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [email, passwordHash, `${first_name} ${last_name}`, phone_number ?? null, id_number, dob, gender]
      ) as [{ insertId: number }, unknown];

      const uid = userResult.insertId;
      await conn.execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [uid, roleRow.role_id]);

      if (role === 'Patient') {
        await conn.execute(
          `INSERT INTO patients (user_id, medical_aid_provider, medical_aid_number,
           emergency_contact_name, emergency_contact_phone, blood_group, allergies)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uid, medical_aid_provider ?? null, medical_aid_number ?? null,
           emergency_contact_name ?? null, emergency_contact_phone ?? null,
           blood_type ?? null, allergies ?? null]
        );
      }

      if (role === 'Doctor') {
        if (!hpcsa_number || !specialization_id || consultation_fee === undefined) {
          throw new Error('Doctor registration requires hpcsa_number, specialization_id, and consultation_fee');
        }
        await conn.execute(
          `INSERT INTO doctors (user_id, hpcs_registration_number, practice_number, specialization_id,
           consultation_fee, years_of_experience, bio)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uid, hpcsa_number, practice_number ?? null, specialization_id,
           consultation_fee, years_of_experience ?? null, bio ?? null]
        );
      }

      return uid;
    });

    // Fetch doctor_id if applicable (so caller can do facility assignment)
    let doctorId: number | undefined;
    if (role === 'Doctor') {
      const docRow = await queryOne<{ id: number }>(
        'SELECT doctor_id AS id FROM doctors WHERE user_id = ?', [userId]
      );
      doctorId = docRow?.id;
    }

    const jwtPayload = { userId, email, roles: [role] as import('@/types').Role[] };
    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken(jwtPayload),
      signRefreshToken(jwtPayload),
    ]);

    await setRefreshCookie(refreshToken);

    const response = created(
      { accessToken, userId, doctorId, email, roles: [role], user: { id: userId, doctorId } },
      'Account created successfully'
    );
    return response;
  } catch (err) {
    console.error('[Register]', err);
    const msg = err instanceof Error ? err.message : 'Registration failed';
    return serverError(msg);
  }
}
