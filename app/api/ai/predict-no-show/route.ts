import { NextRequest } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { ok, badRequest, unauthorized, forbidden, serverError } from '@/lib/response';

/**
 * No-show prediction endpoint.
 * Uses patient's historical no-show rate as a baseline predictor.
 * Replace with ML model when appointment_status_log has enough data.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Admin', 'Doctor', 'Receptionist')) return forbidden();

  const body = await request.json().catch(() => null);
  if (!body?.patient_id || !body?.appointment_datetime) {
    return badRequest('patient_id and appointment_datetime are required');
  }

  const { patient_id, appointment_datetime } = body;

  try {
    // Historical no-show rate for this patient
    const history = await queryOne<{ total: number; no_shows: number }>(
      `SELECT COUNT(*) AS total,
              COUNT(CASE WHEN status = 'No-Show' THEN 1 END) AS no_shows
       FROM appointments WHERE patient_id = ?`,
      [patient_id]
    );

    const total = history?.total ?? 0;
    const noShows = history?.no_shows ?? 0;
    const historicalRate = total > 0 ? noShows / total : 0;

    // Day-of-week factor (Mon/Fri tend to have higher no-shows)
    const dayOfWeek = new Date(appointment_datetime).getDay();
    const dayFactor = [0, 1, 5, 6].includes(dayOfWeek) ? 1.2 : 1.0;

    // Simple probability (replace with ML score)
    const probability = Math.min(0.95, historicalRate * dayFactor + (total === 0 ? 0.15 : 0));

    return ok({
      patient_id,
      appointment_datetime,
      no_show_probability: Math.round(probability * 100) / 100,
      risk_level: probability > 0.5 ? 'High' : probability > 0.25 ? 'Medium' : 'Low',
      historical_no_show_rate: Math.round(historicalRate * 100) / 100,
      total_appointments: total,
      recommendation: probability > 0.5
        ? 'Consider sending an extra reminder or overbooking this slot'
        : 'Standard reminder sufficient',
    });
  } catch (err) {
    console.error('[AI No-Show]', err);
    return serverError();
  }
}
