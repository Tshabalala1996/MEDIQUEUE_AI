# MediQueue AI — requirements traceability

Maps each functional requirement (and AI/ML testable requirement) from the project specification to where it is
implemented and how to demonstrate it. Set up first: `npm run db:migrate`, then `npm run dev`.

| ID | Requirement | Implementation | How to see it |
|----|-------------|----------------|---------------|
| FR01 | Patients book appointments; choose an available date/time; receive confirmation | `app/(dashboard)/patient/book`, `POST /api/appointments`. Slot capacity is reserved atomically server-side (a full slot is refused with 409); overlapping bookings by the same patient are refused; confirmation by email + SMS | Patient → Book Appointment |
| FR02 | Real-time queue tracking; patient sees position and is updated when it changes | `GET /api/queue` (returns `patients_ahead`, recomputed on every read), Socket.IO room per doctor/day pushed on every booking, call, triage, cancellation and status change; `patient/queue` page subscribes via `useQueueSockets` (30 s poll as fallback) | Patient → My Queue; act on the queue in another browser and watch it update |
| FR03 | AI-predicted waiting time, calculated and displayed from queue + historical data | `lib/ml/waitTime.ts` (ridge regression + queueing baseline), `lib/waitTimeService.ts`. Estimate shown while booking, on the patient's queue, and to staff. Every prediction is stored in `wait_time_predictions` with model version and latency, and back-filled with the actual wait when the patient is called | Book → Confirm step; Admin → Analytics → *AI Wait-Time Prediction* |
| FR04 | Classify emergency patients by predefined triage categories; authorised worker classifies, system assigns priority | `lib/triage.ts` (SATS Red/Orange/Yellow/Green; adult TEWS + clinical discriminators), `POST /api/triage/suggest`, `POST /api/triage`; Nurse / Doctor / Admin only. Saved assessment sets `queue.priority_level`; the queue is ordered by priority, then arrival | Nurse → Triage Station → *Triage* |
| FR05 | Automated SMS reminders before appointments | `lib/reminders.ts`, `POST /api/cron/reminders` (called every 5 min by `server.js`), `appointment_reminders` table. Default: 24 h and 2 h before; at most one per window; no duplicates; failed sends retried up to a limit | Admin → System Settings → SMS Reminders |
| FR06 | Dashboards for reporting/monitoring facility performance: waiting times, patient numbers, appointments, queue status | `GET /api/admin/analytics`; Admin dashboard + Analytics page (average / longest wait, consultation length, patients seen, live queue status, triage mix, wait by doctor, AI accuracy) | Admin → Dashboard / Analytics |
| FR07 | Admin manages users, appointments, queues and system settings | Users (`/admin/users`, `POST /api/admin/users` for staff), Appointments (`/admin/appointments`), Queues (`/admin/queues`), Settings (`/admin/settings`, `system_settings` table) | Admin sidebar |
| FR08 | Reports on waiting times, appointments and queue performance for a selected period | `GET /api/reports` (`type`, `from`, `to`, optional `doctor_id`); `components/reports/ReportsView`; per-day and per-doctor tables, CSV export, print. Doctors see only their own data | Admin → Reports, Doctor → Reports |
| FR09 | Staff update queue/consultation status: waiting, being attended to, completed, referred | `PATCH /api/queue/:id` actions `call`, `complete`, `no-show`, `skip`, `waiting`, `refer` (referral records destination + reason and notifies the patient); UI in receptionist, nurse, doctor and admin queue pages | Any staff queue page |
| FR10 | *"The system shall allow doctor…"* | **The specification text is cut off mid-sentence.** Existing doctor capabilities: view/record patient history (`/doctor/patients`, diagnosis form), manage availability (`/doctor/availability`), manage their queue, refer, triage, own reports. Send the full requirement to confirm it is covered. | — |

## AI Emergency Symptom Pre-Check (added on request, not in the original FR list)

Patients can describe symptoms in free text before booking (`/patient/symptoms` → *Emergency Pre-Check*). An LLM
(OpenRouter, `POST /api/ai/emergency-check`) screens for emergency red flags; if flagged Red/Orange, the system
finds a doctor actually on duty at the chosen hospital and fast-tracks the patient into that doctor's queue at
top priority, bypassing normal slot booking. If no doctor is available, or the AI check itself fails, the patient
is told explicitly to seek emergency care directly — the app never silently treats an unreachable check as "not
an emergency". A keyword-based fallback (`lib/ai/emergencyCheck.ts`) can independently flag an emergency even if
the AI call fails. Every fast-tracked entry is marked `ai_flagged` and shown to staff until a clinician confirms
or overrides it via the existing Triage screen (`POST /api/triage`, which clears the flag). Every check — emergency
or not — is logged to `ai_symptom_checks` for audit. Requires `OPENROUTER_API_KEY` in `.env.local`; without it,
the keyword fallback still runs and the patient sees a fixed "call emergency services" message instead of AI text.

**This is decision support that gates a real workflow action (queue-jumping) and has not been clinically
validated** — see T03 below, which applies here too.

## AI/ML testable requirements

| ID | Requirement | Status |
|----|-------------|--------|
| T01 | Wait-time MAE ≤ 5 minutes | **Measurable, not yet proven on real data.** Training reports hold-out MAE against a queueing baseline; live MAE against actual waits is on the Analytics page. Achieving ≤ 5 min depends on your data volume and variability. `npm run verify` shows the pipeline reaches ~1.5 min on synthetic, learnable data (this demonstrates the implementation, not real-world accuracy). |
| T02 | Predictions within 3 s for ≥ 95 % | Inference is sub-millisecond; the API records `latency_ms` per prediction and Analytics shows the share within 3 s. |
| T03 | ≥ 90 % sensitivity for emergency cases on a clinically validated dataset | **Not verifiable from this repository.** The triage engine implements the published SATS/TEWS scheme and `npm run verify` checks its bands and overrides on hand-written vignettes, but sensitivity on a *clinically validated* dataset needs that dataset and clinical sign-off. It is decision support: a clinician confirms every category. |

## Interface contract

`POST /api/ai/predict-waiting-time` — body `{ queue_length, available_doctors, average_consultation_time }`
→ `{ predicted_waiting_time, unit: "minutes" }` (plus `range_minutes`, `model_version`, `model_type`, `latency_ms`).
Requires an authenticated user; the prediction is stored as the specification's workflow requires.
