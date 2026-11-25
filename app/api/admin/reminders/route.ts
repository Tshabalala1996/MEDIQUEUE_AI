import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { isSmsConfigured } from '@/lib/notifications';
import { processDueReminders } from '@/lib/reminders';
import { getSettings } from '@/lib/settings';
import { ok, unauthorized, forbidden, serverError } from '@/lib/response';

export const dynamic = 'force-dynamic';

/** Reminder health for the admin settings page: config, totals and the most recent reminders. */
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Admin')) return forbidden();

  try {
    const settings = await getSettings();
    const [totals, recent] = await Promise.all([
      query<{ status: string; n: number }[]>(
        `SELECT status, COUNT(*) AS n FROM appointment_reminders
          WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY status`
      ),
      query<unknown[]>(
        `SELECT r.reminder_id AS id, r.appointment_id, r.lead_hours, r.status, r.attempts, r.error, r.sent_at, r.created_at,
                pu.full_name AS patient_name, a.appointment_datetime
           FROM appointment_reminders r
           JOIN appointments a ON a.appointment_id = r.appointment_id
           JOIN patients p ON p.patient_id = a.patient_id
           JOIN users pu ON pu.user_id = p.user_id
          ORDER BY r.reminder_id DESC LIMIT 15`
      ),
    ]);
    return ok({
      enabled: settings.reminders_enabled,
      lead_hours: settings.reminder_lead_hours,
      sms_configured: isSmsConfigured(),
      last_30_days: Object.fromEntries(totals.map((t) => [t.status, Number(t.n)])),
      recent,
    });
  } catch (err) {
    console.error('[Admin reminders GET]', err);
    return serverError();
  }
}

/** "Send due reminders now" button. */
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Admin')) return forbidden();

  try {
    return ok(await processDueReminders());
  } catch (err) {
    console.error('[Admin reminders POST]', err);
    return serverError();
  }
}
