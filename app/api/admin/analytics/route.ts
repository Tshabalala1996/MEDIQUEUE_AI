import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { getAccuracyReport } from '@/lib/waitTimeService';
import { ok, forbidden, serverError, unauthorized } from '@/lib/response';

export const dynamic = 'force-dynamic';

// Minutes a patient waited: from the appointment time until they were called (never negative).
const WAIT_MINS = 'GREATEST(0, TIMESTAMPDIFF(MINUTE, a.appointment_datetime, q.called_at))';

/** Runs a supplementary query; a failure (e.g. migration pending) yields the fallback instead of breaking the dashboard. */
async function optional<T>(run: Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await run;
  } catch (err) {
    console.error(`[Analytics ${label}]`, err instanceof Error ? err.message : err);
    return fallback;
  }
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Admin')) return forbidden();

  const period = request.nextUrl.searchParams.get('period') ?? 'month'; // day | week | month

  // Qualified with the appointments alias: `users` also has a created_at, so an unqualified
  // column is ambiguous whenever the filter is used inside a join.
  const dateFilter = period === 'day' ? 'DATE(a.created_at) = CURDATE()'
    : period === 'week' ? 'YEARWEEK(a.created_at) = YEARWEEK(NOW())'
    : 'YEAR(a.created_at) = YEAR(NOW()) AND MONTH(a.created_at) = MONTH(NOW())';

  // Same period, but on the day the patient was actually queued.
  const queueDateFilter = period === 'day' ? 'q.queue_date = CURDATE()'
    : period === 'week' ? 'YEARWEEK(q.queue_date) = YEARWEEK(NOW())'
    : 'YEAR(q.queue_date) = YEAR(NOW()) AND MONTH(q.queue_date) = MONTH(NOW())';

  try {
    const [
      appointmentStats,
      topSpecializations,
      doctorPerformance,
      facilityPopularity,
      revenueStats,
      noShowRate,
      waitStats,
      patientStats,
      liveQueue,
      triageMix,
      doctorWaits,
      accuracy,
    ] = await Promise.all([
      // Appointments per status
      query<unknown[]>(
        `SELECT a.status, COUNT(*) AS count FROM appointments a WHERE ${dateFilter} GROUP BY a.status`
      ),
      // Most booked specializations
      query<unknown[]>(
        `SELECT s.name, COUNT(a.appointment_id) AS booking_count
         FROM appointments a
         JOIN doctors d ON d.doctor_id = a.doctor_id
         JOIN specializations s ON s.specialization_id = d.specialization_id
         WHERE ${dateFilter}
         GROUP BY s.specialization_id, s.name ORDER BY booking_count DESC LIMIT 10`
      ),
      // Doctor performance
      query<unknown[]>(
        `SELECT CONCAT('Dr. ', u.full_name) AS doctor_name,
                d.rating_avg AS average_rating, 0 AS total_reviews,
                COUNT(CASE WHEN a.status = 'No-Show' THEN 1 END) AS no_shows,
                COUNT(a.appointment_id) AS total_appointments
         FROM doctors d
         JOIN users u ON u.user_id = d.user_id
         LEFT JOIN appointments a ON a.doctor_id = d.doctor_id AND ${dateFilter}
         GROUP BY d.doctor_id, u.full_name, d.rating_avg
         ORDER BY d.rating_avg DESC LIMIT 20`
      ),
      // Facility popularity
      query<unknown[]>(
        `SELECT a.facility_type,
                COALESCE(a.hospital_id, a.clinic_id) AS facility_id,
                COALESCE(h.name, cl.name) AS facility_name,
                COUNT(*) AS appointment_count
         FROM appointments a
         LEFT JOIN hospitals h ON h.hospital_id = a.hospital_id AND a.facility_type = 'Hospital'
         LEFT JOIN clinics cl ON cl.clinic_id = a.clinic_id AND a.facility_type = 'Clinic'
         WHERE ${dateFilter}
         GROUP BY a.facility_type, COALESCE(a.hospital_id, a.clinic_id), COALESCE(h.name, cl.name)
         ORDER BY appointment_count DESC LIMIT 10`
      ),
      // Revenue — appointments has no consultation_fee of its own; it's the doctor's fee at booking time.
      query<{ total_revenue: number; avg_fee: number }[]>(
        `SELECT SUM(d.consultation_fee) AS total_revenue, AVG(d.consultation_fee) AS avg_fee
         FROM appointments a JOIN doctors d ON d.doctor_id = a.doctor_id
         WHERE a.status = 'Completed' AND ${dateFilter}`
      ),
      // No-show rate
      query<{ total: number; no_shows: number }[]>(
        `SELECT COUNT(*) AS total,
                COUNT(CASE WHEN a.status = 'No-Show' THEN 1 END) AS no_shows
         FROM appointments a WHERE ${dateFilter}`
      ),

      // ── FR06 additions: waiting times, patient numbers, queue status, triage, AI ──
      optional(
        query<{ samples: number; avg_wait: string | null; max_wait: number | null; avg_consult: string | null }[]>(
          `SELECT COUNT(*) AS samples,
                  AVG(${WAIT_MINS}) AS avg_wait,
                  MAX(${WAIT_MINS}) AS max_wait,
                  AVG(CASE WHEN q.ended_at IS NOT NULL AND TIMESTAMPDIFF(MINUTE, q.called_at, q.ended_at) BETWEEN 1 AND 180
                           THEN TIMESTAMPDIFF(MINUTE, q.called_at, q.ended_at) END) AS avg_consult
             FROM queue q JOIN appointments a ON a.appointment_id = q.appointment_id
            WHERE q.called_at IS NOT NULL AND ${queueDateFilter}`
        ),
        [], 'waitStats'
      ),
      optional(
        query<{ unique_patients: number; visits: number }[]>(
          `SELECT COUNT(DISTINCT a.patient_id) AS unique_patients, COUNT(*) AS visits
             FROM queue q JOIN appointments a ON a.appointment_id = q.appointment_id
            WHERE q.status IN ('Completed','In-Progress','Referred') AND ${queueDateFilter}`
        ),
        [], 'patientStats'
      ),
      optional(
        query<{ status: string; count: number }[]>(
          `SELECT status, COUNT(*) AS count FROM queue WHERE queue_date = CURDATE() GROUP BY status`
        ),
        [], 'liveQueue'
      ),
      optional(
        query<{ category: string; count: number; avg_wait: string | null }[]>(
          `SELECT COALESCE(q.triage_category, 'Untriaged') AS category, COUNT(*) AS count,
                  AVG(CASE WHEN q.called_at IS NOT NULL THEN ${WAIT_MINS} END) AS avg_wait
             FROM queue q JOIN appointments a ON a.appointment_id = q.appointment_id
            WHERE ${queueDateFilter}
            GROUP BY COALESCE(q.triage_category, 'Untriaged')`
        ),
        [], 'triageMix'
      ),
      optional(
        query<{ doctor_name: string; patients: number; avg_wait: string | null }[]>(
          `SELECT CONCAT('Dr. ', u.full_name) AS doctor_name, COUNT(*) AS patients, AVG(${WAIT_MINS}) AS avg_wait
             FROM queue q
             JOIN appointments a ON a.appointment_id = q.appointment_id
             JOIN doctors d ON d.doctor_id = q.doctor_id
             JOIN users u ON u.user_id = d.user_id
            WHERE q.called_at IS NOT NULL AND ${queueDateFilter}
            GROUP BY d.doctor_id, u.full_name
            ORDER BY avg_wait DESC LIMIT 10`
        ),
        [], 'doctorWaits'
      ),
      getAccuracyReport(30),
    ]);

    const w = waitStats[0];
    const num = (v: string | number | null | undefined) => (v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10);

    return ok({
      period,
      appointments: appointmentStats,
      top_specializations: topSpecializations,
      doctor_performance: doctorPerformance,
      facility_popularity: facilityPopularity,
      revenue: revenueStats[0] ?? { total_revenue: 0, avg_fee: 0 },
      no_show_rate: noShowRate[0] ?? { total: 0, no_shows: 0 },
      waiting_times: {
        samples: Number(w?.samples ?? 0),
        avg_wait_minutes: num(w?.avg_wait),
        max_wait_minutes: w?.max_wait != null ? Number(w.max_wait) : null,
        avg_consultation_minutes: num(w?.avg_consult),
      },
      patients: {
        unique_patients: Number(patientStats[0]?.unique_patients ?? 0),
        visits: Number(patientStats[0]?.visits ?? 0),
      },
      live_queue: Object.fromEntries(liveQueue.map((r) => [r.status, Number(r.count)])),
      triage_mix: triageMix.map((r) => ({ category: r.category, count: Number(r.count), avg_wait_minutes: num(r.avg_wait) })),
      doctor_waits: doctorWaits.map((r) => ({ doctor_name: r.doctor_name, patients: Number(r.patients), avg_wait_minutes: num(r.avg_wait) })),
      ai_accuracy: accuracy,
    });
  } catch (err) {
    console.error('[Analytics GET]', err);
    return serverError();
  }
}
