import { NextRequest } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { reportQuerySchema } from '@/lib/validators';
import { ok, badRequest, forbidden, serverError, unauthorized, validationError } from '@/lib/response';

export const dynamic = 'force-dynamic';

const MAX_RANGE_DAYS = 366;

// Minutes a patient waited: from the appointment time until they were called (never negative).
const WAIT = 'GREATEST(0, TIMESTAMPDIFF(MINUTE, a.appointment_datetime, q.called_at))';
const CONSULT =
  '(CASE WHEN q.ended_at IS NOT NULL AND TIMESTAMPDIFF(MINUTE, q.called_at, q.ended_at) BETWEEN 1 AND 180 ' +
  'THEN TIMESTAMPDIFF(MINUTE, q.called_at, q.ended_at) END)';

interface Column { key: string; label: string }

interface ReportDef {
  title: string;
  from: string;
  where: string;
  doctorCol: string;
  dateExpr: string;
  select: string;
  columns: Column[];
}

const QUEUE_FROM = 'queue q JOIN appointments a ON a.appointment_id = q.appointment_id';

const REPORTS: Record<'waiting-times' | 'appointments' | 'queue-performance', ReportDef> = {
  'waiting-times': {
    title: 'Patient waiting times',
    from: QUEUE_FROM,
    where: 'q.called_at IS NOT NULL AND q.queue_date BETWEEN ? AND ?',
    doctorCol: 'q.doctor_id',
    dateExpr: 'q.queue_date',
    select:
      `COUNT(*) AS patients_called, ROUND(AVG(${WAIT}), 1) AS avg_wait_minutes, ` +
      `MAX(${WAIT}) AS max_wait_minutes, ROUND(AVG(${CONSULT}), 1) AS avg_consultation_minutes`,
    columns: [
      { key: 'patients_called', label: 'Patients called' },
      { key: 'avg_wait_minutes', label: 'Avg wait (min)' },
      { key: 'max_wait_minutes', label: 'Longest wait (min)' },
      { key: 'avg_consultation_minutes', label: 'Avg consultation (min)' },
    ],
  },
  appointments: {
    title: 'Appointments',
    from: 'appointments a',
    where: 'DATE(a.appointment_datetime) BETWEEN ? AND ?',
    doctorCol: 'a.doctor_id',
    dateExpr: 'DATE(a.appointment_datetime)',
    select:
      `COUNT(*) AS total, SUM(a.status = 'Scheduled') AS scheduled, SUM(a.status = 'Confirmed') AS confirmed, ` +
      `SUM(a.status = 'In-Progress') AS in_progress, SUM(a.status = 'Completed') AS completed, ` +
      `SUM(a.status = 'Cancelled') AS cancelled, SUM(a.status = 'No-Show') AS no_show, SUM(a.status = 'Referred') AS referred`,
    columns: [
      { key: 'total', label: 'Total' },
      { key: 'scheduled', label: 'Scheduled' },
      { key: 'confirmed', label: 'Confirmed' },
      { key: 'in_progress', label: 'In progress' },
      { key: 'completed', label: 'Completed' },
      { key: 'cancelled', label: 'Cancelled' },
      { key: 'no_show', label: 'No-show' },
      { key: 'referred', label: 'Referred' },
    ],
  },
  'queue-performance': {
    title: 'Queue performance',
    from: QUEUE_FROM,
    where: 'q.queue_date BETWEEN ? AND ?',
    doctorCol: 'q.doctor_id',
    dateExpr: 'q.queue_date',
    select:
      `COUNT(*) AS entries, SUM(q.status = 'Completed') AS completed, SUM(q.status = 'No-Show') AS no_show, ` +
      `SUM(q.status = 'Skipped') AS skipped, SUM(q.status = 'Referred') AS referred, ` +
      `SUM(q.status IN ('Waiting','In-Progress')) AS still_open, ` +
      `ROUND(100 * SUM(q.status = 'Completed') / COUNT(*), 1) AS completion_rate_pct, ` +
      `ROUND(AVG(CASE WHEN q.called_at IS NOT NULL THEN ${WAIT} END), 1) AS avg_wait_minutes, ` +
      `ROUND(AVG(${CONSULT}), 1) AS avg_consultation_minutes, ` +
      `SUM(q.triage_category = 'Red') AS red, SUM(q.triage_category = 'Orange') AS orange, ` +
      `SUM(q.triage_category = 'Yellow') AS yellow, SUM(q.triage_category = 'Green') AS green`,
    columns: [
      { key: 'entries', label: 'Queue entries' },
      { key: 'completed', label: 'Completed' },
      { key: 'no_show', label: 'No-show' },
      { key: 'skipped', label: 'Skipped' },
      { key: 'referred', label: 'Referred' },
      { key: 'still_open', label: 'Still open' },
      { key: 'completion_rate_pct', label: 'Completion %' },
      { key: 'avg_wait_minutes', label: 'Avg wait (min)' },
      { key: 'avg_consultation_minutes', label: 'Avg consultation (min)' },
      { key: 'red', label: 'Red' },
      { key: 'orange', label: 'Orange' },
      { key: 'yellow', label: 'Yellow' },
      { key: 'green', label: 'Green' },
    ],
  },
};

/** mysql2 returns SUM()/AVG() as strings; make every metric a number (null stays null). */
function numeric(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = k === 'date' || k === 'doctor' ? v : v === null || v === undefined ? null : Number(v);
  }
  return out;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Admin', 'Doctor')) return forbidden('Reports are available to administrators and doctors');

  const sp = request.nextUrl.searchParams;
  const parsed = reportQuerySchema.safeParse({
    type: sp.get('type'),
    from: sp.get('from'),
    to: sp.get('to'),
    doctor_id: sp.get('doctor_id') || undefined,
  });
  if (!parsed.success) {
    return validationError(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  const { type, from, to } = parsed.data;

  const span = daysBetween(from, to);
  if (Number.isNaN(span) || span < 0) return badRequest('"from" must be on or before "to"');
  if (span > MAX_RANGE_DAYS) return badRequest(`Choose a period of at most ${MAX_RANGE_DAYS} days`);

  try {
    // Doctors only ever see their own figures; admins may narrow to one doctor.
    let doctorId: number | undefined = parsed.data.doctor_id;
    if (!hasRole(user, 'Admin')) {
      const doc = await queryOne<{ id: number }>('SELECT doctor_id AS id FROM doctors WHERE user_id = ?', [user.userId]);
      if (!doc) return forbidden('Doctor record not found');
      doctorId = doc.id;
    }

    const def = REPORTS[type];
    const filter = doctorId ? ` AND ${def.doctorCol} = ?` : '';
    const params: unknown[] = doctorId ? [from, to, doctorId] : [from, to];

    const [summaryRows, dailyRows, doctorRows] = await Promise.all([
      query<Record<string, unknown>[]>(`SELECT ${def.select} FROM ${def.from} WHERE ${def.where}${filter}`, params),
      // Group by the exact expression that is selected: MySQL's default ONLY_FULL_GROUP_BY mode
      // rejects DATE_FORMAT(DATE(x)) in the select list when only DATE(x) is grouped.
      query<Record<string, unknown>[]>(
        `SELECT DATE_FORMAT(${def.dateExpr}, '%Y-%m-%d') AS date, ${def.select}
           FROM ${def.from} WHERE ${def.where}${filter}
          GROUP BY DATE_FORMAT(${def.dateExpr}, '%Y-%m-%d')
          ORDER BY DATE_FORMAT(${def.dateExpr}, '%Y-%m-%d') ASC`,
        params
      ),
      query<Record<string, unknown>[]>(
        `SELECT CONCAT('Dr. ', u.full_name) AS doctor, ${def.select}
           FROM ${def.from}
           JOIN doctors d ON d.doctor_id = ${def.doctorCol}
           JOIN users u ON u.user_id = d.user_id
          WHERE ${def.where}${filter}
          GROUP BY d.doctor_id, u.full_name ORDER BY u.full_name ASC`,
        params
      ),
    ]);

    return ok({
      type,
      title: def.title,
      from,
      to,
      doctor_id: doctorId ?? null,
      generated_at: new Date().toISOString(),
      columns: def.columns,
      summary: numeric(summaryRows[0] ?? {}),
      rows: dailyRows.map(numeric),
      by_doctor: doctorRows.map(numeric),
    });
  } catch (err) {
    console.error('[Reports GET]', err);
    return serverError();
  }
}
