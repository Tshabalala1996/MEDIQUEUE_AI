# Hospital Queue Management System — Setup Guide

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| npm | 10+ | Bundled with Node.js |
| MySQL | 8.0+ | [mysql.com](https://dev.mysql.com/downloads/) |

---

## 1. Install dependencies

```bash
cd hospital
npm install
```

---

## 2. Create the MySQL database

Open a MySQL shell and run:

```sql
CREATE DATABASE hospital_queue_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'hospital_user'@'localhost' IDENTIFIED BY 'StrongPassword123!';
GRANT ALL PRIVILEGES ON hospital_queue_db.* TO 'hospital_user'@'localhost';
FLUSH PRIVILEGES;
USE hospital_queue_db;
```

Then import your schema:

```bash
mysql -u hospital_user -p hospital_queue_db < schema.sql
```

> **Note:** The schema file should contain your full CREATE TABLE statements. If you have seed data, run it after the schema: `mysql -u hospital_user -p hospital_queue_db < seed.sql`

---

### 2a. Apply the requirements migration

After the base schema is in place (and again after pulling new changes), run:

```bash
npm run db:migrate
```

It is idempotent and only changes what is missing. It adds the **Nurse** role, triage / referral / estimated-wait columns on `queue`,
the `Referred` status, emergency appointment follow-up fields and table, and the tables `triage_assessments`,
`wait_time_predictions`, `ml_models`, `appointment_reminders` and `system_settings`. **Run it before starting the app** —
the queue, triage, reports, settings and emergency follow-up features depend on it.

Emergency ambulance arrival times use a clearly labelled 30-minute estimate when no dispatch provider is configured.
Set `AMBULANCE_ESTIMATED_ARRIVAL_MINUTES` to an integer from 1 to 180 to adjust the estimate. This value does not dispatch
an ambulance; a real dispatch integration must replace it before requests can be sent to a provider.

---

## 3. Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=hospital_user
DB_PASSWORD=StrongPassword123!
DB_NAME=hospital_queue_db
DB_CONNECTION_LIMIT=10

# JWT — generate two separate secrets (min 32 chars each):
# node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=<generate-a-long-random-string>
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=<generate-another-long-random-string>
JWT_REFRESH_EXPIRES_IN=7d

# Email (Gmail example — use an App Password, not your login password)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password
EMAIL_FROM="Hospital Queue <noreply@hospitalqueue.co.za>"

# SMS — BulkSMS South Africa (https://www.bulksms.com)
SMS_API_TOKEN=your_bulksms_api_token
SMS_FROM=HospitalQ

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

Generate JWT secrets quickly:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 4. Run in development mode

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 5. Seed initial data (recommended)

After the server starts, create the first Admin account via the API:

```bash
# Register admin (bypass the UI which only allows Patient/Doctor/Receptionist)
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@hospital.co.za",
    "password": "Admin@12345",
    "first_name": "System",
    "last_name": "Admin",
    "id_number": "8001015009087",
    "role": "Admin"
  }' | jq .
```

Then add specializations, hospitals, and clinics via the Admin dashboard or API.

---

## 6. Build for production

```bash
npm run build
npm start
```

The production server runs on port 3000 by default. Use a reverse proxy (nginx/caddy) in front for SSL termination.

---

## 7. Application URLs

| URL | Description |
|-----|-------------|
| `/` | Landing page |
| `/login` | Login page |
| `/register` | Registration (Patient / Doctor / Receptionist) |
| `/patient` | Patient dashboard (book, live queue, history, bills) |
| `/doctor` | Doctor dashboard (queue, availability, **reports**) |
| `/nurse` | Nurse triage station (**triage**, queue) |
| `/receptionist` | Receptionist dashboard |
| `/admin` | Admin dashboard (analytics, **reports**, appointments, queues, users, **settings**) |
| `/queue-board?doctor_id=1&facility=City+General` | Public TV queue display |
| `/unauthorized` | Unauthorized access page |

---

## 8. Queue board (public TV display)

The queue board is unauthenticated and designed for a waiting-room TV screen:

```
http://localhost:3000/queue-board?doctor_id=1&facility=City%20General%20Hospital
```

Parameters:
- `doctor_id` — filters the queue to a specific doctor (required for live SSE updates)
- `facility` — display name shown in the header (optional, defaults to "Hospital Queue System")

Without `doctor_id` it polls every 30 seconds showing all queues for today.

---

## 9. Email configuration (Gmail)

1. Enable 2-Factor Authentication on your Google account
2. Go to Google Account → Security → App Passwords
3. Generate an app password for "Mail"
4. Use that 16-character password as `SMTP_PASS`

For production, use a transactional email service (SendGrid, Mailgun, AWS SES) and update the SMTP settings accordingly.
SMTP TLS verification uses Node's bundled CA certificates and, when supported by the installed Node.js version,
the operating system's trusted CA certificates. Certificate validation remains enabled.

---

## 10. SMS configuration (BulkSMS)

1. Register at [bulksms.com](https://www.bulksms.com)
2. Top up your account with credits
3. Generate an API token from your account settings
4. Set `SMS_API_TOKEN` in `.env.local`

SMS messages are sent for appointment confirmations, queue calls and **automated appointment reminders**. The system falls back gracefully if SMS is not configured (nothing is sent, and failures are non-fatal).

The code supports **Africa's Talking** (`AT_API_KEY`, `AT_USERNAME`; username `sandbox` uses their free test environment) and **BulkSMS** (`SMS_TOKEN_ID`, `SMS_TOKEN_SECRET`). Africa's Talking is used when its key is set.

### Automated reminders

`server.js` checks for due reminders every 5 minutes (via `POST /api/cron/reminders`, authenticated with `CRON_SECRET`).
By default a patient gets one SMS 24 hours and one 2 hours before their appointment. Change the lead times, retry limit, or switch
reminders off under **Admin → System Settings**, where you can also see recent reminders and press **Send due reminders now**.
Appointments booked closer than a lead time skip that reminder (they already received the booking confirmation).
Reminders are not sent until an SMS provider is configured.

## 10a. AI wait-time model

Waiting times use a queueing formula (patients ahead × the doctor's average consultation time) until enough history exists.
Once at least `ml_min_training_samples` (default 30) consultations have been completed, go to **Admin → Analytics → Train model now**.
A ridge-regression model is trained on your own queue history and is only **activated if it beats the formula on a held-out test set**;
the page shows the measured hold-out error (MAE) and, afterwards, the live error of predictions against the waits patients actually had.
The spec's target is MAE ≤ 5 minutes — whether your data reaches it can only be known by training on it.

Run `npm run verify` to check the model and triage logic offline (no database needed).

---

## 11. Role overview

| Role | Can do |
|------|--------|
| **Patient** | Book appointments, follow their live queue position and AI wait estimate, check symptoms, view medical history |
| **Doctor** | View today's queue, triage, refer, manage appointments, set availability, view patient history, own reports |
| **Nurse** | Triage patients (AI-assisted, SATS/TEWS), call / complete / refer / no-show, view the queue |
| **Receptionist** | Walk-in registrations, manage queue (call/complete/skip/no-show), book appointments on behalf of patients |
| **Admin** | Everything above + manage users (incl. creating Nurse/Receptionist/Admin accounts), appointments, queues, hospitals, clinics, system settings, analytics and reports |

Nurse, Receptionist and Admin accounts are created by an Admin under **Admin → Add Staff**.

---

## 12. Troubleshooting

**`ECONNREFUSED` on database queries**
→ Check MySQL is running and `DB_HOST`/`DB_PORT` are correct.

**`JWT_SECRET` errors**
→ Ensure your secret is at least 32 characters.

**SMS not sending**
→ Check `SMS_API_TOKEN` and that your BulkSMS account has credits. SMS failures are non-fatal.

**Email not sending**
→ Verify SMTP credentials. Use an App Password for Gmail, not your account password.

**`proxy.ts` / middleware issues**
→ This project uses `proxy.ts` (Next.js 16 convention). Do NOT create a `middleware.ts` — it will conflict.

**Build errors on `useSearchParams()`**
→ Any page using `useSearchParams()` must be a client component wrapped in a `<Suspense>` boundary at the page level.
