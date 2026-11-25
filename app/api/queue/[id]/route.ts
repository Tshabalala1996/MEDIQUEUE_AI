import { NextRequest } from 'next/server';
import { queryOne, query } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { ok, forbidden, notFound, serverError, badRequest, unauthorized, conflict } from '@/lib/response';
import { queueActionSchema } from '@/lib/validators';
import { broadcastQueueUpdate } from '../route';
import { emitQueueUpdate } from '@/lib/socketServer';
import { sendQueueCallNotification, sendReferralNotification } from '@/lib/notifications';
import { recalculateQueueEstimates, recordActualWait } from '@/lib/waitTimeService';

// Referring a patient onward is a clinical decision, so receptionists cannot do it.
const CLINICAL_ACTIONS = new Set(['refer']);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Doctor', 'Nurse', 'Receptionist', 'Admin')) return forbidden();

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON');

  const parsed = queueActionSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? 'Invalid action. Use: call, complete, no-show, skip, waiting, refer');
  }

  const { action, referred_to, referral_reason } = parsed.data;
  if (CLINICAL_ACTIONS.has(action) && !hasRole(user, 'Doctor', 'Nurse', 'Admin')) {
    return forbidden('Only clinical staff can refer a patient');
  }

  try {
    const entry = await queryOne<{
      id: number; appointment_id: number; doctor_id: number; patient_id: number;
      queue_position: number; status: string; queue_date: string; appointment_datetime: string;
    }>(
      // queue_date is formatted here: mysql2 would otherwise return a Date, which
      // does not match the "YYYY-MM-DD" room names used for real-time updates.
      `SELECT q.queue_id AS id, q.appointment_id, q.doctor_id, a.patient_id,
              q.position AS queue_position, q.status,
              DATE_FORMAT(q.queue_date, '%Y-%m-%d') AS queue_date,
              a.appointment_datetime
       FROM queue q JOIN appointments a ON a.appointment_id = q.appointment_id WHERE q.queue_id = ?`,
      [id]
    );
    if (!entry) return notFound('Queue entry not found');

    if (entry.status === 'Completed' || entry.status === 'Referred') {
      return conflict(`This patient is already ${entry.status.toLowerCase()} and can no longer be changed`);
    }

    const patientInfo = await queryOne<{
      email: string; phone: string | null; full_name: string; user_id: number;
    }>(
      `SELECT u.email, u.phone, u.full_name, u.user_id
       FROM patients p JOIN users u ON u.user_id = p.user_id WHERE p.patient_id = ?`,
      [entry.patient_id]
    );

    switch (action) {
      case 'call': {
        // The real wait (appointment time → called, never negative) is stored so predictions can be scored against it.
        await query(
          `UPDATE queue SET status = 'In-Progress', called_at = NOW(), started_at = NOW(),
                  actual_wait_mins = GREATEST(0, TIMESTAMPDIFF(MINUTE,
                    (SELECT a.appointment_datetime FROM appointments a WHERE a.appointment_id = queue.appointment_id), NOW()))
            WHERE queue_id = ?`,
          [id]
        );
        await query(`UPDATE appointments SET status = 'In-Progress' WHERE appointment_id = ?`, [entry.appointment_id]);

        const waited = await queryOne<{ actual_wait_mins: number | null }>(
          'SELECT actual_wait_mins FROM queue WHERE queue_id = ?', [id]
        );
        if (waited?.actual_wait_mins !== null && waited?.actual_wait_mins !== undefined) {
          await recordActualWait(Number(id), Number(waited.actual_wait_mins));
        }

        if (patientInfo) {
          sendQueueCallNotification(
            patientInfo.email, patientInfo.phone, patientInfo.user_id,
            entry.appointment_id, patientInfo.full_name, entry.queue_position
          ).catch(console.error);
        }
        break;
      }
      case 'complete': {
        await query(`UPDATE queue SET status = 'Completed', ended_at = NOW() WHERE queue_id = ?`, [id]);
        await query(`UPDATE appointments SET status = 'Completed' WHERE appointment_id = ?`, [entry.appointment_id]);
        break;
      }
      case 'no-show': {
        await query(`UPDATE queue SET status = 'No-Show' WHERE queue_id = ?`, [id]);
        await query(`UPDATE appointments SET status = 'No-Show' WHERE appointment_id = ?`, [entry.appointment_id]);
        break;
      }
      case 'skip': {
        const maxPos = await queryOne<{ maxPos: number }>(
          `SELECT MAX(position) AS maxPos FROM queue
           WHERE doctor_id = ? AND queue_date = ? AND status = 'Waiting'`,
          [entry.doctor_id, entry.queue_date]
        );
        const newPos = (maxPos?.maxPos ?? entry.queue_position) + 1;
        await query(`UPDATE queue SET position = ?, status = 'Waiting' WHERE queue_id = ?`, [newPos, id]);
        break;
      }
      case 'waiting': {
        // Return a patient to the waiting list (e.g. called by mistake, or a no-show who arrived late).
        await query(
          `UPDATE queue SET status = 'Waiting', called_at = NULL, started_at = NULL, ended_at = NULL WHERE queue_id = ?`,
          [id]
        );
        await query(`UPDATE appointments SET status = 'Scheduled' WHERE appointment_id = ?`, [entry.appointment_id]);
        break;
      }
      case 'refer': {
        await query(
          `UPDATE queue SET status = 'Referred', ended_at = NOW(), referred_to = ?, referral_reason = ?, referred_at = NOW()
            WHERE queue_id = ?`,
          [referred_to!, referral_reason ?? null, id]
        );
        await query(`UPDATE appointments SET status = 'Referred' WHERE appointment_id = ?`, [entry.appointment_id]);

        if (patientInfo) {
          sendReferralNotification(
            patientInfo.email, patientInfo.phone, patientInfo.user_id, entry.appointment_id,
            { patientName: patientInfo.full_name, referredTo: referred_to!, reason: referral_reason ?? null }
          ).catch(console.error);
        }
        break;
      }
    }

    // The action already succeeded; a failure to refresh estimates must not turn it into an error.
    await recalculateQueueEstimates(entry.doctor_id, entry.queue_date).catch((err) =>
      console.error('[Queue PATCH] estimate refresh failed', err)
    );
    broadcastQueueUpdate(entry.doctor_id, entry.queue_date);
    emitQueueUpdate(entry.doctor_id, entry.queue_date);
    return ok(null, `Queue entry ${action} successful`);
  } catch (err) {
    console.error('[Queue PATCH]', err);
    return serverError();
  }
}
