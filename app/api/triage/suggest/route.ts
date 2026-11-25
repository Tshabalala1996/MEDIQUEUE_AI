import { NextRequest } from 'next/server';
import { getAuthUser, hasRole } from '@/lib/auth';
import { suggestTriage } from '@/lib/triage';
import { buildTriageInput, loadTriageContext } from '@/lib/triageService';
import { triageSuggestSchema } from '@/lib/validators';
import { ok, badRequest, notFound, forbidden, serverError, unauthorized, validationError } from '@/lib/response';

export const dynamic = 'force-dynamic';

/**
 * AI-assisted triage suggestion (FR04). Read-only: nothing is saved and no
 * priority changes until an authorised healthcare worker confirms via POST /api/triage.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Nurse', 'Doctor', 'Admin')) return forbidden('Only clinical staff can triage patients');

  const body = await request.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON');

  const parsed = triageSuggestSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }

  try {
    const { queue_id, ...clinical } = parsed.data;
    const ctx = await loadTriageContext(queue_id);
    if (!ctx) return notFound('Queue entry not found');

    const suggestion = suggestTriage(buildTriageInput(clinical, ctx));
    return ok({
      suggestion,
      patient: { name: ctx.patient_name, age_years: ctx.ageYears },
      reported_symptoms: ctx.symptoms.length,
      disclaimer: 'Decision support only. The final triage category is the responsibility of the assessing clinician.',
    });
  } catch (err) {
    console.error('[Triage suggest]', err);
    return serverError();
  }
}
