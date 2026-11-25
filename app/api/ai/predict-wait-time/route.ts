import { NextRequest } from 'next/server';
import { queryOne } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { getDoctorAvgConsult, predictWait } from '@/lib/waitTimeService';
import { formatWait } from '@/lib/ml/waitTime';
import { ok, badRequest, unauthorized, serverError } from '@/lib/response';

export const dynamic = 'force-dynamic';

/**
 * Expected wait for a doctor at a given appointment time (used while booking).
 * Uses the active trained model when one exists, otherwise the queueing formula
 * (patients ahead × the doctor's average consultation time).
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();

  const { searchParams } = request.nextUrl;
  const doctor_id = Number(searchParams.get('doctor_id'));
  const appointment_datetime = searchParams.get('appointment_datetime');

  if (!doctor_id || !appointment_datetime) {
    return badRequest('doctor_id and appointment_datetime are required');
  }
  const when = new Date(appointment_datetime);
  if (Number.isNaN(when.getTime())) return badRequest('appointment_datetime is not a valid date');

  try {
    const date = appointment_datetime.slice(0, 10);

    // Patients already queued for that doctor/day whose appointment is earlier than the requested time.
    const ahead = await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM queue q
         JOIN appointments a ON a.appointment_id = q.appointment_id
        WHERE q.doctor_id = ? AND q.queue_date = ?
          AND a.appointment_datetime < ? AND q.status IN ('Waiting','In-Progress')`,
      [doctor_id, date, appointment_datetime]
    );

    const avgConsultationMinutes = await getDoctorAvgConsult(doctor_id);
    const patientsAhead = Number(ahead?.count ?? 0);
    const prediction = await predictWait({
      patientsAhead,
      availableDoctors: 1,
      avgConsultMinutes: avgConsultationMinutes,
      priorityLevel: 4,
      hourOfDay: when.getHours(),
    });

    return ok({
      doctor_id,
      appointment_datetime,
      patients_ahead: patientsAhead,
      avg_consultation_minutes: avgConsultationMinutes,
      predicted_wait_minutes: prediction.minutes,
      predicted_wait_display: formatWait(prediction.minutes),
      range_minutes: prediction.range ? { low: prediction.range[0], high: prediction.range[1] } : null,
      model_version: prediction.modelVersion,
      confidence: prediction.modelType === 'ml' ? 'model' : 'estimated',
    });
  } catch (err) {
    console.error('[AI Wait Time]', err);
    return serverError();
  }
}
