// Run: node scripts/send-test-emails.js
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

// Parse .env.local manually
const envPath = path.join(__dirname, '..', '.env.local');
const env = {};
fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const eq = trimmed.indexOf('=');
  if (eq === -1) return;
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  env[key] = val;
});

const APP_URL = env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(env.SMTP_PORT) || 587,
  secure: env.SMTP_SECURE === 'true',
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

function emailWrapper(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#060E22;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#060E22;min-height:100vh;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:560px">
        <tr>
          <td align="center" style="padding-bottom:28px">
            <img src="${APP_URL}/logo.svg" alt="MediQueue AI" width="72" height="72"
              style="border-radius:20px;display:block;margin:0 auto 12px" />
            <p style="margin:0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:2px">MediQueue AI</p>
            <p style="margin:4px 0 0;font-size:10px;color:rgba(255,255,255,0.35);letter-spacing:4px;text-transform:uppercase">Healthcare</p>
          </td>
        </tr>
        <tr>
          <td style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:24px;padding:36px;color:#ffffff">
            ${body}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-top:24px">
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2)">
              © ${new Date().getFullYear()} MediQueue AI Healthcare · South Africa<br>
              This is a test email — do not reply.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const TO = 'vutomi99.ngobeni@gmail.com';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const emails = [
  {
    subject: '[MediQueue AI] Appointment Booked - Dr Sipho Dlamini - 07 July 2026',
    html: emailWrapper(`
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#ffffff">Appointment Confirmed ✅</h2>
      <p style="margin:0 0 20px;color:rgba(255,255,255,0.6);font-size:14px">Dear <strong style="color:#fff">Vutomi Ngobeni</strong>, your appointment has been successfully booked.</p>
      <table style="width:100%;border-collapse:collapse;border-radius:12px;overflow:hidden;margin-bottom:20px">
        <tr style="background:rgba(255,255,255,0.08)">
          <td style="padding:12px 16px;color:rgba(255,255,255,0.5);font-size:13px;width:40%">Doctor</td>
          <td style="padding:12px 16px;color:#fff;font-weight:700;font-size:13px">Dr Sipho Dlamini</td>
        </tr>
        <tr style="background:rgba(255,255,255,0.04)">
          <td style="padding:12px 16px;color:rgba(255,255,255,0.5);font-size:13px">Facility</td>
          <td style="padding:12px 16px;color:#fff;font-size:13px">Charlotte Maxeke Hospital, Johannesburg</td>
        </tr>
        <tr style="background:rgba(255,255,255,0.08)">
          <td style="padding:12px 16px;color:rgba(255,255,255,0.5);font-size:13px">Date &amp; Time</td>
          <td style="padding:12px 16px;color:#fff;font-size:13px">Monday, 07 July 2026 at 09:00</td>
        </tr>
        <tr style="background:rgba(255,255,255,0.04)">
          <td style="padding:12px 16px;color:rgba(255,255,255,0.5);font-size:13px">Reference</td>
          <td style="padding:12px 16px;color:#2346E8;font-weight:700;font-size:13px;font-family:monospace">APT-1001</td>
        </tr>
      </table>
      <p style="margin:0;padding:14px 16px;background:rgba(35,70,232,0.2);border:1px solid rgba(35,70,232,0.4);border-radius:12px;color:rgba(255,255,255,0.7);font-size:13px">
        Please arrive <strong style="color:#fff">15 minutes early</strong> with your SA ID document. If you have a medical aid, bring your card.
      </p>
    `),
  },
  {
    subject: '[MediQueue AI] Queue Update - Please proceed to the consultation room',
    html: emailWrapper(`
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#ffffff">🔔 It's Your Turn!</h2>
      <p style="margin:0 0 20px;color:rgba(255,255,255,0.6);font-size:14px">Dear <strong style="color:#fff">Vutomi Ngobeni</strong>, the doctor is ready to see you now.</p>
      <div style="text-align:center;padding:28px;background:rgba(35,70,232,0.2);border:1px solid rgba(35,70,232,0.5);border-radius:16px;margin-bottom:20px">
        <p style="margin:0 0 4px;font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:2px">Queue Position</p>
        <p style="margin:0;font-size:56px;font-weight:900;color:#ffffff;line-height:1">#3</p>
      </div>
      <p style="margin:0;padding:14px 16px;background:rgba(255,165,0,0.15);border:1px solid rgba(255,165,0,0.35);border-radius:12px;color:rgba(255,255,255,0.8);font-size:13px;text-align:center">
        👣 Please proceed to the <strong style="color:#fff">consultation room</strong> immediately.
      </p>
    `),
  },
  {
    subject: '[MediQueue AI] Billing Summary - Charlotte Maxeke Hospital - BILL-2001',
    html: emailWrapper(`
      <h2 style="margin:0 0 4px;font-size:20px;font-weight:800;color:#ffffff">Medical Invoice</h2>
      <p style="margin:0 0 20px;color:rgba(255,255,255,0.4);font-size:13px">Charlotte Maxeke Hospital, Johannesburg</p>
      <p style="margin:0 0 20px;color:rgba(255,255,255,0.6);font-size:14px">
        Dear <strong style="color:#fff">Vutomi Ngobeni</strong>,<br>
        Your visit on <strong style="color:#fff">Monday, 07 July 2026 at 09:00</strong>
        with <strong style="color:#fff">Dr Sipho Dlamini</strong> has been processed.
      </p>
      <table style="width:100%;border-collapse:collapse;border-radius:12px;overflow:hidden;margin-bottom:4px">
        <tr style="background:rgba(255,255,255,0.08)">
          <td style="padding:12px 16px;color:rgba(255,255,255,0.5);font-size:13px">Patient Category</td>
          <td style="padding:12px 16px;color:#fff;font-size:13px;text-align:right">Private Patient</td>
        </tr>
        <tr style="background:rgba(255,255,255,0.04)">
          <td style="padding:12px 16px;color:rgba(255,255,255,0.5);font-size:13px">File Opening Fee</td>
          <td style="padding:12px 16px;color:#fff;font-size:13px;text-align:right">R50.00</td>
        </tr>
        <tr style="background:rgba(255,255,255,0.08)">
          <td style="padding:12px 16px;color:rgba(255,255,255,0.5);font-size:13px">Consultation Fee</td>
          <td style="padding:12px 16px;color:#fff;font-size:13px;text-align:right">R750.00</td>
        </tr>
      </table>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr style="background:#2346E8;border-radius:12px">
          <td style="padding:16px 20px;color:rgba(255,255,255,0.8);font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;border-radius:12px 0 0 12px">Total Amount Due</td>
          <td style="padding:16px 20px;color:#ffffff;font-size:24px;font-weight:900;text-align:right;border-radius:0 12px 12px 0">R800.00</td>
        </tr>
      </table>
      <p style="margin:0 0 16px;padding:14px 16px;background:rgba(231,76,60,0.15);border:1px solid rgba(231,76,60,0.35);border-radius:12px;color:rgba(255,255,255,0.8);font-size:13px;text-align:center">
        Please pay at the <strong style="color:#fff">cashier or admin office</strong> at the hospital.
      </p>
      <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);text-align:center;font-family:monospace">
        Ref: BILL-2001 · Charlotte Maxeke Hospital
      </p>
    `),
  },
];

async function run() {
  console.log(`Sending from: ${env.SMTP_USER}`);
  console.log(`Sending to:   ${TO}\n`);

  for (let i = 0; i < emails.length; i++) {
    const mail = emails[i];
    try {
      await transporter.sendMail({ from: env.EMAIL_FROM || env.SMTP_USER, to: TO, subject: mail.subject, html: mail.html });
      console.log(`✓ Sent: ${mail.subject}`);
    } catch (err) {
      console.error(`✗ Failed: ${mail.subject}\n  ${err.message}`);
    }
    if (i < emails.length - 1) {
      console.log('  Waiting 4s before next send...');
      await sleep(4000);
    }
  }

  console.log('\nDone.');
}

run();
