import { query } from './db';
import { getSettings } from './settings';
import { isSmsConfigured, saveNotification, sendReminderNotification, sendSMS } from './notifications';

/**
 * Automated appointment reminders — SMS and email, independently (FR05).
 *
 * Called on a timer by server.js (via /api/cron/reminders) and on demand from the
 * admin settings page. Safe to call as often as you like: each (appointment, lead
 * time, channel) triple is claimed once via appointment_reminders' UNIQUE key
 * (appointment_id, lead_hours, channel), so overlapping runs can't double-send and
 * a channel that already succeeded is never retried for that window. SMS gets a
 * bounded retry on failure; email is best-effort (attempted once per window) since
 * it isn't the channel this table's retry logic was designed to track.
 *
 * - an appointment only gets a reminder for the window it is currently in (never
 *   a "24 hour" and a "2 hour" reminder at the same moment);
 * - appointments booked closer than the lead time get no reminder for that window
 *   — they already received the booking confirmation;
 * - a patient with no phone number still gets the email reminder, and a patient
 *   without SMS configured at all still gets email — the two channels never gate
 *   each other.
 */

export interface ReminderRun {
  enabled: boolean;
  smsConfigured: boolean;
  sent: number;
  failed: number;
  skipped: number;
  retried: number;
  emailSent: number;
  emailFailed: number;
}

interface DueAppointment {
  appointment_id: number;
  appointment_datetime: string;
  user_id: number;
  patient_name: string;
  phone: string | null;
  email: string;
  doctor_name: string;
  facility_name: string | null;
}

const DUE_SELECT = `
  SELECT a.appointment_id, a.appointment_datetime, p.user_id,
         pu.full_name AS patient_name, pu.phone, pu.email,
         du.full_name AS doctor_name,
         COALESCE(h.name, cl.name) AS facility_name
    FROM appointments a
    JOIN patients p ON p.patient_id = a.patient_id
    JOIN users pu ON pu.user_id = p.user_id
    JOIN doctors d ON d.doctor_id = a.doctor_id
    JOIN users du ON du.user_id = d.user_id
    LEFT JOIN hospitals h ON h.hospital_id = a.hospital_id AND a.facility_type = 'Hospital'
    LEFT JOIN clinics cl ON cl.clinic_id = a.clinic_id AND a.facility_type = 'Clinic'`;

export function buildReminderSms(a: Pick<DueAppointment, 'appointment_id' | 'appointment_datetime' | 'patient_name' | 'doctor_name' | 'facility_name'>): string {
  const when = new Date(a.appointment_datetime).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
  const where = a.facility_name ? ` at ${a.facility_name}` : '';
  return `Reminder: ${a.patient_name}, you have an appointment with ${a.doctor_name}${where} on ${when}. Ref: APT-${a.appointment_id}. Please arrive 15 minutes early.`;
}

async function claimReminder(a: DueAppointment, leadHours: number, channel: 'SMS' | 'Email'): Promise<boolean> {
  const claim = await query<{ affectedRows: number }>(
    `INSERT IGNORE INTO appointment_reminders (appointment_id, user_id, lead_hours, channel, status, attempts)
     VALUES (?, ?, ?, ?, 'Pending', 0)`,
    [a.appointment_id, a.user_id, leadHours, channel]
  );
  return Number((claim as unknown as { affectedRows: number }).affectedRows) > 0;
}

async function deliverSms(a: DueAppointment, leadHours: number, attempts: number, result: ReminderRun): Promise<void> {
  if (!a.phone) {
    await query(
      `UPDATE appointment_reminders SET status = 'Skipped', error = 'Patient has no phone number'
        WHERE appointment_id = ? AND lead_hours = ? AND channel = 'SMS'`,
      [a.appointment_id, leadHours]
    );
    result.skipped++;
    return;
  }

  const message = buildReminderSms(a);
  const delivered = await sendSMS(a.phone, message);
  if (delivered) {
    await query(
      `UPDATE appointment_reminders SET status = 'Sent', attempts = ?, error = NULL, sent_at = NOW()
        WHERE appointment_id = ? AND lead_hours = ? AND channel = 'SMS'`,
      [attempts, a.appointment_id, leadHours]
    );
    await saveNotification(a.user_id, 'Appointment Reminder', 'SMS', message);
    result.sent++;
  } else {
    await query(
      `UPDATE appointment_reminders SET status = 'Failed', attempts = ?, error = 'SMS provider rejected or could not send'
        WHERE appointment_id = ? AND lead_hours = ? AND channel = 'SMS'`,
      [attempts, a.appointment_id, leadHours]
    );
    result.failed++;
  }
}

async function deliverEmail(a: DueAppointment, leadHours: number, result: ReminderRun): Promise<void> {
  const sent = await sendReminderNotification(a.email, a.user_id, a.appointment_id, {
    patientName: a.patient_name, doctorName: a.doctor_name, facilityName: a.facility_name, datetime: a.appointment_datetime,
  }).catch((err) => { console.error('[Reminders] email failed', err); return false; });

  await query(
    `UPDATE appointment_reminders SET status = ?, attempts = 1, error = ?, sent_at = ${sent ? 'NOW()' : 'NULL'}
      WHERE appointment_id = ? AND lead_hours = ? AND channel = 'Email'`,
    [sent ? 'Sent' : 'Failed', sent ? null : 'Email send failed or not configured', a.appointment_id, leadHours]
  );
  if (sent) result.emailSent++; else result.emailFailed++;
}

export async function processDueReminders(): Promise<ReminderRun> {
  const result: ReminderRun = {
    enabled: false, smsConfigured: isSmsConfigured(),
    sent: 0, failed: 0, skipped: 0, retried: 0, emailSent: 0, emailFailed: 0,
  };

  const settings = await getSettings();
  result.enabled = settings.reminders_enabled;
  if (!result.enabled) return result;

  const leads = settings.reminder_lead_hours; // largest first
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const nextSmaller = leads[i + 1] ?? 0; // window is (now + nextSmaller, now + lead]

    // Deliberately not filtered by what's already been sent — each channel's own claim
    // (below) makes repeat attempts within the same window free no-ops, which keeps this
    // query simple and correct for both channels without them gating each other.
    const due = await query<DueAppointment[]>(
      `${DUE_SELECT}
        WHERE a.status IN ('Scheduled','Confirmed')
          AND a.appointment_datetime >  DATE_ADD(NOW(), INTERVAL ? HOUR)
          AND a.appointment_datetime <= DATE_ADD(NOW(), INTERVAL ? HOUR)
          AND a.created_at <= DATE_SUB(a.appointment_datetime, INTERVAL ? HOUR)
        ORDER BY a.appointment_datetime ASC
        LIMIT 200`,
      [nextSmaller, lead, lead]
    );

    for (const a of due) {
      if (await claimReminder(a, lead, 'Email')) {
        await deliverEmail(a, lead, result);
      }
      if (result.smsConfigured && await claimReminder(a, lead, 'SMS')) {
        await deliverSms(a, lead, 1, result);
      }
    }
  }

  // Retry earlier SMS failures that are still worth sending (email has no retry — it's
  // either deliverable or it isn't, and a misconfigured/down mail server retrying every
  // 5 minutes adds nothing SMS's "maybe the carrier was briefly down" retry does).
  if (result.smsConfigured) {
    const retryable = await query<(DueAppointment & { lead_hours: number; attempts: number })[]>(
      `SELECT r.lead_hours, r.attempts, x.*
         FROM appointment_reminders r
         JOIN (${DUE_SELECT}
                WHERE a.status IN ('Scheduled','Confirmed') AND a.appointment_datetime > NOW()) x
           ON x.appointment_id = r.appointment_id
        WHERE r.status = 'Failed' AND r.channel = 'SMS' AND r.attempts < ?
        LIMIT 100`,
      [settings.reminder_max_attempts]
    );
    for (const r of retryable) {
      result.retried++;
      await deliverSms(r, r.lead_hours, r.attempts + 1, result);
    }
  }

  return result;
}
