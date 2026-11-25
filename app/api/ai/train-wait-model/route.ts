import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getAuthUser, hasRole } from '@/lib/auth';
import { getAccuracyReport, trainAndSaveModel } from '@/lib/waitTimeService';
import { ok, unauthorized, forbidden, serverError } from '@/lib/response';

export const dynamic = 'force-dynamic';

/** Trains the wait-time model on completed consultations and reports hold-out accuracy (T01). */
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Admin')) return forbidden();

  try {
    const outcome = await trainAndSaveModel(user.userId);
    return ok({
      saved: outcome.saved,
      activated: outcome.activated,
      reason: outcome.reason,
      samples_used: outcome.samplesUsed,
      model_id: outcome.modelId,
      model_version: outcome.model?.version ?? null,
      train: outcome.train,
      test: outcome.test,
      baseline_test: outcome.baselineTest,
    });
  } catch (err) {
    console.error('[Train wait model]', err);
    return serverError();
  }
}

/** Live accuracy of predictions vs. real waits, plus the model registry. */
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Admin')) return forbidden();

  try {
    const days = Math.min(365, Math.max(1, Number(request.nextUrl.searchParams.get('days')) || 30));
    const [accuracy, models] = await Promise.all([
      getAccuracyReport(days),
      query<unknown[]>(
        `SELECT model_id AS id, version, algorithm, training_samples, test_samples,
                test_mae_minutes, baseline_mae, test_within_5, is_active, trained_at
           FROM ml_models WHERE name = 'wait-time' ORDER BY model_id DESC LIMIT 10`
      ).catch(() => []),
    ]);
    return ok({ accuracy, models });
  } catch (err) {
    console.error('[Train wait model GET]', err);
    return serverError();
  }
}
