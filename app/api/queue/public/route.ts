import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { ok, serverError } from '@/lib/response';

// Public unauthenticated endpoint used by the queue board TV display
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const doctor_id = searchParams.get('doctor_id');

  const conditions = ['q.queue_date = ?'];
  const params: unknown[] = [date];

  if (doctor_id) {
    conditions.push('q.doctor_id = ?');
    params.push(Number(doctor_id));
  }

  const where = `WHERE ${conditions.join(' AND ')} AND q.status IN ('Waiting','In-Progress')`;

  try {
    const rows = await query<unknown[]>(
      `SELECT q.queue_id AS id, q.position AS queue_position, q.status,
              q.called_at, q.estimated_wait_mins AS estimated_wait_minutes,
              u.full_name AS patient_name,
              a.appointment_datetime
       FROM queue q
       JOIN appointments a ON a.appointment_id = q.appointment_id
       JOIN patients p ON p.patient_id = a.patient_id
       JOIN users u ON u.user_id = p.user_id
       ${where}
       ORDER BY q.priority_level ASC, q.position ASC`,
      params
    );
    return ok(rows);
  } catch (err) {
    console.error('[Queue Public GET]', err);
    return serverError();
  }
}
