import nodemailer from 'nodemailer';
import * as tls from 'node:tls';
import { query } from './db';
import { buildEmergencyFollowupEmail, type EmergencyFollowupEmailDetails } from './emergencyFollowup';

type TlsWithSystemCertificates = typeof tls & {
  getCACertificates?: (type: 'default' | 'system') => string[];
};

const tlsWithSystemCertificates = tls as TlsWithSystemCertificates;
const smtpCaCertificates = typeof tlsWithSystemCertificates.getCACertificates === 'function'
  ? [...new Set([
      ...tlsWithSystemCertificates.getCACertificates('default'),
      ...tlsWithSystemCertificates.getCACertificates('system'),
    ])]
  : undefined;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: true,
    ...(smtpCaCertificates ? { ca: smtpCaCertificates } : {}),
  },
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

function emailWrapper(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#060E22;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#060E22;min-height:100vh;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:560px">

        <!-- Logo header -->
        <tr>
          <td align="center" style="padding-bottom:28px">
            <img src="${APP_URL}/logo.svg" alt="U-CHECK" width="72" height="72"
              style="border-radius:20px;display:block;margin:0 auto 12px" />
            <p style="margin:0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:2px">U-CHECK</p>
            <p style="margin:4px 0 0;font-size:10px;color:rgba(255,255,255,0.35);letter-spacing:4px;text-transform:uppercase">Healthcare</p>
          </td>
        </tr>

        <!-- Glass card -->
        <tr>
          <td style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:24px;padding:36px;color:#ffffff">
            ${body}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td align="center" style="padding-top:24px">
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2)">
              © ${new Date().getFullYear()} U-Check Healthcare · South Africa<br>
              This is an automated message — please do not reply.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!process.env.SMTP_USER) return false;
  try {
    await transporter.sendMail({ from: process.env.EMAIL_FROM, to, subject, html });
    return true;
  } catch (err) {
    const smtpError = err as { code?: unknown; command?: unknown };
    console.error('[Email] delivery failed', {
      code: typeof smtpError.code === 'string' ? smtpError.code : 'UNKNOWN',
      command: typeof smtpError.command === 'string' ? smtpError.command : 'UNKNOWN',
    });
    return false;
  }
}

export async function sendEmergencyFollowupEmail(
  email: string,
  details: EmergencyFollowupEmailDetails
): Promise<boolean> {
  const message = buildEmergencyFollowupEmail(details);
  return sendEmail(email, message.subject, emailWrapper(message.html));
}

function formatSAPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('27')) return digits;
  if (digits.startsWith('0') && digits.length === 10) return '27' + digits.slice(1);
  return digits;
}

/** True when an SMS provider (Africa's Talking or BulkSMS) has credentials configured. */
export function isSmsConfigured(): boolean {
  return Boolean(process.env.AT_API_KEY || (process.env.SMS_TOKEN_ID && process.env.SMS_TOKEN_SECRET));
}

export async function sendSMS(to: string, message: string): Promise<boolean> {
  const formatted = formatSAPhone(to);

  // Africa's Talking (sandbox or production) — preferred when configured
  if (process.env.AT_API_KEY) {
    try {
      const username = process.env.AT_USERNAME || 'sandbox';
      const isSandbox = username === 'sandbox';
      const url = isSandbox
        ? 'https://api.sandbox.africastalking.com/version1/messaging'
        : 'https://api.africastalking.com/version1/messaging';

      const params = new URLSearchParams({ username, to: `+${formatted}`, message });
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'apiKey': process.env.AT_API_KEY,
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      const text = await resp.text();
      if (!resp.ok) { console.error('[SMS] Africa\'s Talking error:', text); return false; }
      console.log('[SMS] Africa\'s Talking sent:', isSandbox ? '(sandbox)' : '', `to +${formatted}`);
      return true;
    } catch (err) {
      console.error('[SMS] Africa\'s Talking:', err);
      return false;
    }
  }

  // BulkSMS fallback
  if (!process.env.SMS_TOKEN_ID || !process.env.SMS_TOKEN_SECRET) return false;
  try {
    const auth = Buffer.from(`${process.env.SMS_TOKEN_ID}:${process.env.SMS_TOKEN_SECRET}`).toString('base64');
    const body: Record<string, unknown>[] = [{ to: formatted, body: message }];
    if (process.env.SMS_FROM) body[0].from = process.env.SMS_FROM;
    const resp = await fetch('https://api.bulksms.com/v1/messages', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) console.error('[SMS] BulkSMS error:', await resp.text());
    return resp.ok;
  } catch (err) {
    console.error('[SMS]', err);
    return false;
  }
}

// notifications table: user_id, type, title, message, is_read, sent_at, delivered_at
export async function saveNotification(
  userId: number,
  title: string,
  type: 'SMS' | 'Email' | 'In-App',
  message: string
): Promise<void> {
  await query(
    `INSERT INTO notifications (user_id, type, title, message, sent_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [userId, type, title, message]
  ).catch(console.error);
}

export async function sendAppointmentConfirmation(
  email: string,
  phone: string | null,
  userId: number,
  appointmentId: number,
  details: {
    patientName: string;
    doctorName: string;
    facilityName: string;
    datetime: string;
  }
): Promise<void> {
  const sms = `Dear ${details.patientName}, your appointment with ${details.doctorName} at ${details.facilityName} on ${new Date(details.datetime).toLocaleString('en-ZA')} is confirmed. Ref: APT-${appointmentId}`;

  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#ffffff">Appointment Confirmed ✅</h2>
    <p style="margin:0 0 20px;color:rgba(255,255,255,0.6);font-size:14px">Dear <strong style="color:#fff">${details.patientName}</strong>, your appointment has been successfully booked.</p>
    <table style="width:100%;border-collapse:collapse;border-radius:12px;overflow:hidden;margin-bottom:20px">
      <tr style="background:rgba(255,255,255,0.08)">
        <td style="padding:12px 16px;color:rgba(255,255,255,0.5);font-size:13px;width:40%">Doctor</td>
        <td style="padding:12px 16px;color:#fff;font-weight:700;font-size:13px">${details.doctorName}</td>
      </tr>
      <tr style="background:rgba(255,255,255,0.04)">
        <td style="padding:12px 16px;color:rgba(255,255,255,0.5);font-size:13px">Facility</td>
        <td style="padding:12px 16px;color:#fff;font-size:13px">${details.facilityName}</td>
      </tr>
      <tr style="background:rgba(255,255,255,0.08)">
        <td style="padding:12px 16px;color:rgba(255,255,255,0.5);font-size:13px">Date &amp; Time</td>
        <td style="padding:12px 16px;color:#fff;font-size:13px">${new Date(details.datetime).toLocaleString('en-ZA')}</td>
      </tr>
      <tr style="background:rgba(255,255,255,0.04)">
        <td style="padding:12px 16px;color:rgba(255,255,255,0.5);font-size:13px">Reference</td>
        <td style="padding:12px 16px;color:#2346E8;font-weight:700;font-size:13px;font-family:monospace">APT-${appointmentId}</td>
      </tr>
    </table>
    <p style="margin:0;padding:14px 16px;background:rgba(35,70,232,0.2);border:1px solid rgba(35,70,232,0.4);border-radius:12px;color:rgba(255,255,255,0.7);font-size:13px">
      Please arrive <strong style="color:#fff">15 minutes early</strong> with your SA ID document. If you have a medical aid, bring your card.
    </p>`);

  const [, smsSent] = await Promise.all([
    sendEmail(email, 'Appointment Confirmed - Hospital Queue', html),
    phone ? sendSMS(phone, sms) : Promise.resolve(false),
  ]);

  await Promise.all([
    saveNotification(userId, 'Appointment Confirmed', 'Email', sms),
    smsSent ? saveNotification(userId, 'Appointment Confirmed', 'SMS', sms) : Promise.resolve(),
  ]);
}

export async function sendQueueCallNotification(
  email: string,
  phone: string | null,
  userId: number,
  appointmentId: number,
  patientName: string,
  queuePosition: number
): Promise<void> {
  const sms = `${patientName}, it is your turn! Please proceed to the consultation room. Queue #${queuePosition}. Ref: APT-${appointmentId}`;
  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#ffffff">🔔 It's Your Turn!</h2>
    <p style="margin:0 0 20px;color:rgba(255,255,255,0.6);font-size:14px">Dear <strong style="color:#fff">${patientName}</strong>, the doctor is ready to see you now.</p>
    <div style="text-align:center;padding:28px;background:rgba(35,70,232,0.2);border:1px solid rgba(35,70,232,0.5);border-radius:16px;margin-bottom:20px">
      <p style="margin:0 0 4px;font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:2px">Queue Position</p>
      <p style="margin:0;font-size:56px;font-weight:900;color:#ffffff;line-height:1">#${queuePosition}</p>
    </div>
    <p style="margin:0;padding:14px 16px;background:rgba(255,165,0,0.15);border:1px solid rgba(255,165,0,0.35);border-radius:12px;color:rgba(255,255,255,0.8);font-size:13px;text-align:center">
      👣 Please proceed to the <strong style="color:#fff">consultation room</strong> immediately.
    </p>`);

  const [, smsSent] = await Promise.all([
    sendEmail(email, "It's Your Turn — Please Proceed to the Consultation Room", html),
    phone ? sendSMS(phone, sms) : Promise.resolve(false),
  ]);

  await Promise.all([
    saveNotification(userId, "It's Your Turn", 'In-App', sms),
    smsSent ? saveNotification(userId, "It's Your Turn", 'SMS', sms) : Promise.resolve(),
  ]);
}

export async function sendBillNotification(
  email: string,
  phone: string | null,
  userId: number,
  billId: number,
  details: {
    patientName: string;
    doctorName: string;
    facilityName: string;
    appointmentDatetime: string;
    fileFee: number;
    serviceFee: number;
    totalAmount: number;
    patientCategory: string;
  }
): Promise<void> {
  const fmt = (n: number) => `R${Number(n).toFixed(2)}`;
  const categoryLabels: Record<string, string> = {
    Indigent: 'Indigent (Free)',
    H1: 'H1 — Subsidised',
    H2: 'H2 — Co-payment',
    H3: 'H3 — Standard rate',
    Private: 'Private patient',
  };

  const sms = details.totalAmount === 0
    ? `Dear ${details.patientName}, your visit to ${details.facilityName} is FREE as an ${categoryLabels[details.patientCategory] ?? details.patientCategory} patient. Ref: BILL-${billId}`
    : `Dear ${details.patientName}, your bill from ${details.facilityName}: File fee ${fmt(details.fileFee)}, Services ${fmt(details.serviceFee)}, TOTAL DUE: ${fmt(details.totalAmount)}. Ref: BILL-${billId}. Please pay at the cashier.`;

  const html = emailWrapper(`
    <h2 style="margin:0 0 4px;font-size:20px;font-weight:800;color:#ffffff">Medical Invoice</h2>
    <p style="margin:0 0 20px;color:rgba(255,255,255,0.4);font-size:13px">${details.facilityName}</p>

    <p style="margin:0 0 20px;color:rgba(255,255,255,0.6);font-size:14px">
      Dear <strong style="color:#fff">${details.patientName}</strong>,<br>
      Your visit on <strong style="color:#fff">${new Date(details.appointmentDatetime).toLocaleString('en-ZA')}</strong>
      with <strong style="color:#fff">${details.doctorName}</strong> has been processed.
    </p>

    <table style="width:100%;border-collapse:collapse;border-radius:12px;overflow:hidden;margin-bottom:4px">
      <tr style="background:rgba(255,255,255,0.08)">
        <td style="padding:12px 16px;color:rgba(255,255,255,0.5);font-size:13px">Patient Category</td>
        <td style="padding:12px 16px;color:#fff;font-size:13px;text-align:right">${categoryLabels[details.patientCategory] ?? details.patientCategory}</td>
      </tr>
      <tr style="background:rgba(255,255,255,0.04)">
        <td style="padding:12px 16px;color:rgba(255,255,255,0.5);font-size:13px">File Opening Fee</td>
        <td style="padding:12px 16px;color:#fff;font-size:13px;text-align:right">${fmt(details.fileFee)}</td>
      </tr>
      <tr style="background:rgba(255,255,255,0.08)">
        <td style="padding:12px 16px;color:rgba(255,255,255,0.5);font-size:13px">Consultation Fee</td>
        <td style="padding:12px 16px;color:#fff;font-size:13px;text-align:right">${fmt(details.serviceFee)}</td>
      </tr>
    </table>

    <!-- Total row -->
    <div style="background:#2346E8;border-radius:12px;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <span style="color:rgba(255,255,255,0.8);font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Total Amount Due</span>
      <span style="color:#ffffff;font-size:24px;font-weight:900">${details.totalAmount === 0 ? 'FREE' : fmt(details.totalAmount)}</span>
    </div>

    ${details.totalAmount === 0
      ? `<p style="margin:0 0 16px;padding:14px 16px;background:rgba(39,174,96,0.15);border:1px solid rgba(39,174,96,0.35);border-radius:12px;color:rgba(255,255,255,0.8);font-size:13px;text-align:center">
          ✅ No payment required — you qualify for free healthcare services.
         </p>`
      : `<p style="margin:0 0 16px;padding:14px 16px;background:rgba(231,76,60,0.15);border:1px solid rgba(231,76,60,0.35);border-radius:12px;color:rgba(255,255,255,0.8);font-size:13px;text-align:center">
          Please pay at the <strong style="color:#fff">cashier or admin office</strong> at the hospital.
         </p>`
    }

    <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);text-align:center;font-family:monospace">
      Ref: BILL-${billId} · ${details.facilityName}
    </p>`);

  const [, smsSent] = await Promise.all([
    sendEmail(email, `Your Medical Bill — ${details.facilityName} (BILL-${billId})`, html),
    phone ? sendSMS(phone, sms) : Promise.resolve(false),
  ]);

  await Promise.all([
    saveNotification(userId, `Medical Bill — ${fmt(details.totalAmount)} due`, 'Email', sms),
    smsSent ? saveNotification(userId, `Medical Bill — ${fmt(details.totalAmount)} due`, 'SMS', sms) : Promise.resolve(),
  ]);
}

/** Returns whether the email was actually sent, so callers can track per-channel delivery state. */
export async function sendReminderNotification(
  email: string,
  userId: number,
  appointmentId: number,
  details: { patientName: string; doctorName: string; facilityName: string | null; datetime: string }
): Promise<boolean> {
  const when = new Date(details.datetime).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#ffffff">⏰ Appointment Reminder</h2>
    <p style="margin:0 0 20px;color:rgba(255,255,255,0.6);font-size:14px">Dear <strong style="color:#fff">${details.patientName}</strong>, this is a reminder of your upcoming appointment.</p>
    <table style="width:100%;border-collapse:collapse;border-radius:12px;overflow:hidden;margin-bottom:20px">
      <tr style="background:rgba(255,255,255,0.08)">
        <td style="padding:12px 16px;color:rgba(255,255,255,0.5);font-size:13px;width:40%">Doctor</td>
        <td style="padding:12px 16px;color:#fff;font-weight:700;font-size:13px">${details.doctorName}</td>
      </tr>
      ${details.facilityName ? `<tr style="background:rgba(255,255,255,0.04)">
        <td style="padding:12px 16px;color:rgba(255,255,255,0.5);font-size:13px">Facility</td>
        <td style="padding:12px 16px;color:#fff;font-size:13px">${details.facilityName}</td>
      </tr>` : ''}
      <tr style="background:rgba(255,255,255,0.08)">
        <td style="padding:12px 16px;color:rgba(255,255,255,0.5);font-size:13px">Date &amp; Time</td>
        <td style="padding:12px 16px;color:#fff;font-size:13px">${when}</td>
      </tr>
      <tr style="background:rgba(255,255,255,0.04)">
        <td style="padding:12px 16px;color:rgba(255,255,255,0.5);font-size:13px">Reference</td>
        <td style="padding:12px 16px;color:#2346E8;font-weight:700;font-size:13px;font-family:monospace">APT-${appointmentId}</td>
      </tr>
    </table>
    <p style="margin:0;padding:14px 16px;background:rgba(35,70,232,0.2);border:1px solid rgba(35,70,232,0.4);border-radius:12px;color:rgba(255,255,255,0.7);font-size:13px">
      Please arrive <strong style="color:#fff">15 minutes early</strong> with your SA ID document.
    </p>`);

  const sent = await sendEmail(email, 'Appointment Reminder — U-CHECK Healthcare', html);
  if (sent) await saveNotification(userId, 'Appointment Reminder', 'Email', `Reminder email sent for APT-${appointmentId}`);
  return sent;
}

export async function sendReferralNotification(
  email: string,
  phone: string | null,
  userId: number,
  appointmentId: number,
  details: { patientName: string; referredTo: string; reason: string | null }
): Promise<void> {
  const sms = `Dear ${details.patientName}, you have been referred to ${details.referredTo}. Ref: APT-${appointmentId}.`;
  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#ffffff">↗ You've Been Referred</h2>
    <p style="margin:0 0 20px;color:rgba(255,255,255,0.6);font-size:14px">Dear <strong style="color:#fff">${details.patientName}</strong>, you have been referred for further care.</p>
    <table style="width:100%;border-collapse:collapse;border-radius:12px;overflow:hidden;margin-bottom:20px">
      <tr style="background:rgba(255,255,255,0.08)">
        <td style="padding:12px 16px;color:rgba(255,255,255,0.5);font-size:13px;width:40%">Referred to</td>
        <td style="padding:12px 16px;color:#fff;font-weight:700;font-size:13px">${details.referredTo}</td>
      </tr>
      ${details.reason ? `<tr style="background:rgba(255,255,255,0.04)">
        <td style="padding:12px 16px;color:rgba(255,255,255,0.5);font-size:13px">Reason</td>
        <td style="padding:12px 16px;color:#fff;font-size:13px">${details.reason}</td>
      </tr>` : ''}
      <tr style="background:rgba(255,255,255,0.08)">
        <td style="padding:12px 16px;color:rgba(255,255,255,0.5);font-size:13px">Reference</td>
        <td style="padding:12px 16px;color:#2346E8;font-weight:700;font-size:13px;font-family:monospace">APT-${appointmentId}</td>
      </tr>
    </table>`);

  const [, smsSent] = await Promise.all([
    sendEmail(email, 'Referral Notice — U-CHECK Healthcare', html),
    phone ? sendSMS(phone, sms) : Promise.resolve(false),
  ]);

  await Promise.all([
    saveNotification(userId, 'Referral', 'Email', sms),
    smsSent ? saveNotification(userId, 'Referral', 'SMS', sms) : Promise.resolve(),
  ]);
}

export async function sendEmergencyNotification(
  email: string,
  phone: string | null,
  userId: number,
  appointmentId: number,
  details: { patientName: string; doctorName: string; facilityName: string; category: 'Red' | 'Orange' }
): Promise<void> {
  const label = details.category === 'Red' ? 'EMERGENCY' : 'URGENT';
  const sms = `${label}: ${details.patientName}, you have been added to ${details.doctorName}'s queue with top priority at ${details.facilityName}. Please proceed there now. Ref: APT-${appointmentId}.`;
  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#ffffff">🚨 ${label}: Top Priority Queue</h2>
    <p style="margin:0 0 20px;color:rgba(255,255,255,0.6);font-size:14px">Dear <strong style="color:#fff">${details.patientName}</strong>, our AI emergency pre-check has flagged your symptoms and added you to a doctor's queue with top priority.</p>
    <table style="width:100%;border-collapse:collapse;border-radius:12px;overflow:hidden;margin-bottom:20px">
      <tr style="background:rgba(255,255,255,0.08)">
        <td style="padding:12px 16px;color:rgba(255,255,255,0.5);font-size:13px;width:40%">Doctor</td>
        <td style="padding:12px 16px;color:#fff;font-weight:700;font-size:13px">${details.doctorName}</td>
      </tr>
      <tr style="background:rgba(255,255,255,0.04)">
        <td style="padding:12px 16px;color:rgba(255,255,255,0.5);font-size:13px">Facility</td>
        <td style="padding:12px 16px;color:#fff;font-size:13px">${details.facilityName}</td>
      </tr>
      <tr style="background:rgba(255,255,255,0.08)">
        <td style="padding:12px 16px;color:rgba(255,255,255,0.5);font-size:13px">Reference</td>
        <td style="padding:12px 16px;color:#2346E8;font-weight:700;font-size:13px;font-family:monospace">APT-${appointmentId}</td>
      </tr>
    </table>
    <p style="margin:0;padding:14px 16px;background:rgba(231,76,60,0.2);border:1px solid rgba(231,76,60,0.5);border-radius:12px;color:rgba(255,255,255,0.85);font-size:13px;font-weight:700;text-align:center">
      Please proceed to the hospital now. If this is life-threatening, call emergency services (10177 / 112).
    </p>`);

  const [, smsSent] = await Promise.all([
    sendEmail(email, `${label}: Please proceed to the hospital now — U-CHECK Healthcare`, html),
    phone ? sendSMS(phone, sms) : Promise.resolve(false),
  ]);

  await Promise.all([
    saveNotification(userId, 'Urgent care — please proceed to the hospital', 'Email', sms),
    smsSent ? saveNotification(userId, 'Urgent care — please proceed to the hospital', 'SMS', sms) : Promise.resolve(),
  ]);
}
