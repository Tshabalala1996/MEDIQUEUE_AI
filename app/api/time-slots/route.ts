import { NextRequest } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { doctorAvailabilitySchema } from '@/lib/validators';
import { ok, created, forbidden, serverError, badRequest, unauthorized, validationError } from '@/lib/response';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const doctor_id = searchParams.get('doctor_id');
  const facility_type = searchParams.get('facility_type');
  const facility_id = searchParams.get('facility_id');
  const date_from = searchParams.get('date_from') ?? new Date().toISOString().slice(0, 10);
  const date_to = searchParams.get('date_to');

  // Build conditions for hospital_time_slots (uses hospital_id column)
  const hospConditions = ['ts.is_available = 1', 'ts.slot_date >= ?'];
  const hospParams: unknown[] = [date_from];

  // Build conditions for clinic_time_slots (uses clinic_id column)
  const clinicConditions = ['ts.is_available = 1', 'ts.slot_date >= ?'];
  const clinicParams: unknown[] = [date_from];

  if (doctor_id) {
    hospConditions.push('ts.doctor_id = ?'); hospParams.push(Number(doctor_id));
    clinicConditions.push('ts.doctor_id = ?'); clinicParams.push(Number(doctor_id));
  }
  if (facility_id && facility_type === 'Hospital') {
    hospConditions.push('ts.hospital_id = ?'); hospParams.push(Number(facility_id));
  }
  if (facility_id && facility_type === 'Clinic') {
    clinicConditions.push('ts.clinic_id = ?'); clinicParams.push(Number(facility_id));
  }
  if (date_to) {
    hospConditions.push('ts.slot_date <= ?'); hospParams.push(date_to);
    clinicConditions.push('ts.slot_date <= ?'); clinicParams.push(date_to);
  }
  // Only show slots with remaining capacity (unless `show_all=1` is passed, e.g. for doctor management)
  const showAll = request.nextUrl.searchParams.get('show_all') === '1';
  if (!showAll) {
    hospConditions.push('ts.booked_count < ts.max_patients');
    clinicConditions.push('ts.booked_count < ts.max_patients');
  }

  try {
    let slots: unknown[] = [];
    if (facility_type === 'Hospital') {
      slots = await query<unknown[]>(
        `SELECT ts.slot_id AS id, ts.doctor_id, ts.hospital_id AS facility_id,
                'Hospital' AS facility_type,
                DATE_FORMAT(ts.slot_date, '%Y-%m-%d') AS slot_date,
                TIME_FORMAT(ts.start_time, '%H:%i') AS start_time,
                TIME_FORMAT(ts.end_time, '%H:%i') AS end_time,
                ts.is_available, ts.max_patients AS max_appointments, ts.booked_count AS current_bookings,
                u.full_name AS doctor_name,
                s.name AS specialization_name
         FROM hospital_time_slots ts
         JOIN doctors d ON d.doctor_id = ts.doctor_id
         JOIN users u ON u.user_id = d.user_id
         JOIN specializations s ON s.specialization_id = d.specialization_id
         WHERE ${hospConditions.join(' AND ')}
         ORDER BY ts.slot_date ASC, ts.start_time ASC`,
        hospParams
      );
    } else if (facility_type === 'Clinic') {
      slots = await query<unknown[]>(
        `SELECT ts.slot_id AS id, ts.doctor_id, ts.clinic_id AS facility_id,
                'Clinic' AS facility_type,
                DATE_FORMAT(ts.slot_date, '%Y-%m-%d') AS slot_date,
                TIME_FORMAT(ts.start_time, '%H:%i') AS start_time,
                TIME_FORMAT(ts.end_time, '%H:%i') AS end_time,
                ts.is_available, ts.max_patients AS max_appointments, ts.booked_count AS current_bookings,
                u.full_name AS doctor_name,
                s.name AS specialization_name
         FROM clinic_time_slots ts
         JOIN doctors d ON d.doctor_id = ts.doctor_id
         JOIN users u ON u.user_id = d.user_id
         JOIN specializations s ON s.specialization_id = d.specialization_id
         WHERE ${clinicConditions.join(' AND ')}
         ORDER BY ts.slot_date ASC, ts.start_time ASC`,
        clinicParams
      );
    } else {
      const [hospSlots, clinicSlots] = await Promise.all([
        query<unknown[]>(
          `SELECT ts.slot_id AS id, ts.doctor_id, ts.hospital_id AS facility_id,
                  'Hospital' AS facility_type,
                  DATE_FORMAT(ts.slot_date, '%Y-%m-%d') AS slot_date,
                  TIME_FORMAT(ts.start_time, '%H:%i') AS start_time,
                  TIME_FORMAT(ts.end_time, '%H:%i') AS end_time,
                  ts.is_available, ts.max_patients AS max_appointments, ts.booked_count AS current_bookings,
                  u.full_name AS doctor_name
           FROM hospital_time_slots ts
           JOIN doctors d ON d.doctor_id = ts.doctor_id JOIN users u ON u.user_id = d.user_id
           WHERE ${hospConditions.join(' AND ')} ORDER BY ts.slot_date ASC, ts.start_time ASC`,
          hospParams
        ),
        query<unknown[]>(
          `SELECT ts.slot_id AS id, ts.doctor_id, ts.clinic_id AS facility_id,
                  'Clinic' AS facility_type,
                  DATE_FORMAT(ts.slot_date, '%Y-%m-%d') AS slot_date,
                  TIME_FORMAT(ts.start_time, '%H:%i') AS start_time,
                  TIME_FORMAT(ts.end_time, '%H:%i') AS end_time,
                  ts.is_available, ts.max_patients AS max_appointments, ts.booked_count AS current_bookings,
                  u.full_name AS doctor_name
           FROM clinic_time_slots ts
           JOIN doctors d ON d.doctor_id = ts.doctor_id JOIN users u ON u.user_id = d.user_id
           WHERE ${clinicConditions.join(' AND ')} ORDER BY ts.slot_date ASC, ts.start_time ASC`,
          clinicParams
        ),
      ]);
      slots = [...hospSlots, ...clinicSlots];
    }

    return ok(slots);
  } catch (err) {
    console.error('[Time Slots GET]', err);
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Doctor', 'Admin')) return forbidden();

  const body = await request.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON');

  const parsed = doctorAvailabilitySchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }

  const { facility_type, facility_id, slots } = parsed.data;

  let doctor_id: number;
  if (hasRole(user, 'Doctor')) {
    const doc = await queryOne<{ id: number }>('SELECT doctor_id AS id FROM doctors WHERE user_id = ?', [user.userId]);
    if (!doc) return forbidden('Doctor record not found');
    doctor_id = doc.id;
  } else {
    doctor_id = Number(body.doctor_id);
  }

  const table = facility_type === 'Hospital' ? 'hospital_time_slots' : 'clinic_time_slots';
  const facilityCol = facility_type === 'Hospital' ? 'hospital_id' : 'clinic_id';

  try {
    for (const slot of slots) {
      await query(
        `INSERT INTO ${table} (doctor_id, ${facilityCol}, slot_date, start_time, end_time, max_patients)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [doctor_id, facility_id, slot.slot_date, slot.start_time, slot.end_time, slot.max_appointments]
      );
    }
    return created({ count: slots.length }, `${slots.length} time slots created`);
  } catch (err) {
    console.error('[Time Slots POST]', err);
    return serverError();
  }
}
