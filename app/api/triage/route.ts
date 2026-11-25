import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { suggestTriage, TRIAGE_META } from '@/lib/triage';
import { buildTriageInput, loadTriageContext } from '@/lib/triageService';
import { recalculateQueueEstimates } from '@/lib/waitTimeService';
import { emitQueueUpdate } from '@/lib/socketServer';
import { broadcastQueueUpdate } from '@/app/api/queue/route';
import { triageSaveSchema } from '@/lib/validators';
import { ok, created, badRequest, notFound, conflict, forbidden, serverError, unauthorized, validationError } from '@/lib/response';

export const dynamic = 'force-dynamic';

/** Triage history for one queue entry. */
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Nurse', 'Doctor', 'Admin')) return forbidden();

  const queueId = Number(request.nextUrl.searchParams.get('queue_id'));
  if (!queueId) return badRequest('queue_id is required');

  try {
    const rows = await query<unknown[]>(
      `SELECT t.assessment_id AS id, t.category, t.priority_level, t.tews_score, t.ai_category, t.ai_confidence,
              t.source, t.rationale, t.notes, t.assessed_at, u.full_name AS assessed_by_name
         FROM triage_assessments t JOIN users u ON u.user_id = t.assessed_by
        WHERE t.queue_id = ? ORDER BY t.assessment_id DESC`,
      [queueId]
    );
    return ok(rows);
  } catch (err) {
    console.error('[Triage GET]', err);
    return serverError();
  }
}

/**
 * Records a triage decision made by an authorised healthcare worker (FR04):
 * stores the assessment, sets the patient's priority level and re-ranks the queue.
 * The AI suggestion is recomputed server-side and stored next to the human decision
 * so overrides can be audited; the client's opinion of what the AI said is never trusted.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Nurse', 'Doctor', 'Admin')) return forbidden('Only clinical staff can triage patients');

  const body = await request.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON');

  const parsed = triageSaveSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  const { queue_id, category, notes, ...clinical } = parsed.data;

  try {
    const ctx = await loadTriageContext(queue_id);
    if (!ctx) return notFound('Queue entry not found');
    if (ctx.status !== 'Waiting' && ctx.status !== 'In-Progress') {
      return conflict(`Cannot triage a patient who is ${ctx.status.toLowerCase()}`);
    }

    const suggestion = suggestTriage(buildTriageInput(clinical, ctx));
    const source =
      suggestion.category === null ? 'Manual' : suggestion.category === category ? 'AI-Confirmed' : 'AI-Overridden';

    if (source === 'AI-Overridden' && !notes?.trim()) {
      return badRequest('Please add a note explaining why you are overriding the suggested category');
    }

    const priority = TRIAGE_META[category].priority;
    const insert = await query<{ insertId: number }>(
      `INSERT INTO triage_assessments
         (queue_id, appointment_id, patient_id, category, priority_level, tews_score, ai_category, ai_confidence,
          source, vitals, discriminators, rationale, notes, assessed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [queue_id, ctx.appointment_id, ctx.patient_id, category, priority, suggestion.tewsScore,
       suggestion.category, suggestion.confidence, source,
       JSON.stringify({ ...clinical.vitals, avpu: clinical.avpu ?? null, mobility: clinical.mobility ?? null, trauma: clinical.trauma ?? false }),
       JSON.stringify(clinical.discriminators ?? []),
       suggestion.rationale.join('\n'), notes?.trim() || null, user.userId]
    );

    // A human has now reviewed this patient, so any AI emergency fast-track flag is resolved.
    await query(
      'UPDATE queue SET priority_level = ?, triage_category = ?, ai_flagged = 0 WHERE queue_id = ?',
      [priority, category, queue_id]
    );

    // Priority changes who is ahead of whom, so every waiting estimate must be refreshed.
    await recalculateQueueEstimates(ctx.doctor_id, ctx.queue_date).catch((err) =>
      console.error('[Triage] estimate refresh failed', err)
    );
    broadcastQueueUpdate(ctx.doctor_id, ctx.queue_date);
    emitQueueUpdate(ctx.doctor_id, ctx.queue_date);

    return created(
      {
        assessmentId: (insert as unknown as { insertId: number }).insertId,
        category,
        priority_level: priority,
        target_minutes: TRIAGE_META[category].targetMinutes,
        source,
        ai_category: suggestion.category,
      },
      `Patient triaged ${category} (${TRIAGE_META[category].label})`
    );
  } catch (err) {
    console.error('[Triage POST]', err);
    return serverError();
  }
}
