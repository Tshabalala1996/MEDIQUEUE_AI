import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { predictWaitingTimeSchema } from '@/lib/validators';
import { logPrediction, predictWait } from '@/lib/waitTimeService';
import { badRequest, serverError, unauthorized, validationError } from '@/lib/response';

export const dynamic = 'force-dynamic';

/**
 * POST /api/ai/predict-waiting-time   (interface contract, FR03 / T01 / T02)
 *
 * INPUT  { "queue_length": 15, "available_doctors": 3, "average_consultation_time": 12 }
 * OUTPUT { "predicted_waiting_time": 25, "unit": "minutes" }
 *
 * The top-level shape follows the contract exactly; a few extra fields
 * (model version, ± range, latency) are added alongside. The prediction is
 * stored for accuracy monitoring, as the workflow in the spec requires.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();

  const body = await request.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON');

  const parsed = predictWaitingTimeSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  const d = parsed.data;

  try {
    const features = {
      patientsAhead: d.queue_length,
      availableDoctors: d.available_doctors,
      avgConsultMinutes: d.average_consultation_time,
      priorityLevel: d.priority_level ?? 4,
      hourOfDay: d.hour_of_day ?? new Date().getHours(),
    };
    const prediction = await predictWait(features);
    await logPrediction({ doctorId: d.doctor_id ?? null, features, prediction });

    return Response.json({
      success: true,
      predicted_waiting_time: prediction.minutes,
      unit: 'minutes',
      range_minutes: prediction.range ? { low: prediction.range[0], high: prediction.range[1] } : null,
      model_version: prediction.modelVersion,
      model_type: prediction.modelType,
      latency_ms: prediction.latencyMs,
    });
  } catch (err) {
    console.error('[AI predict-waiting-time]', err);
    return serverError();
  }
}
