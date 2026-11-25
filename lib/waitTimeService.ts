import { query, queryOne } from './db';
import { getSettings } from './settings';
import {
  baselineWait,
  predictWithModel,
  trainWaitModel,
  type TrainResult,
  type WaitFeatures,
  type WaitModel,
  type WaitSample,
} from './ml/waitTime';

/**
 * Database-facing side of the wait-time prediction feature (FR03).
 * The maths lives in lib/ml/waitTime.ts.
 */

export const MODEL_NAME = 'wait-time';
export const BASELINE_VERSION = 'baseline-queueing-v1';

export interface Prediction {
  minutes: number;
  /** ± hold-out MAE of the active model; null for the baseline formula. */
  range: [number, number] | null;
  modelVersion: string;
  modelType: 'ml' | 'baseline';
  latencyMs: number;
}

// ─── Active model ────────────────────────────────────────────────────────────

let modelCache: { at: number; model: WaitModel | null } | null = null;
const MODEL_TTL_MS = 60_000;

export function invalidateModelCache(): void {
  modelCache = null;
}

export async function getActiveModel(): Promise<WaitModel | null> {
  if (modelCache && Date.now() - modelCache.at < MODEL_TTL_MS) return modelCache.model;
  let model: WaitModel | null = null;
  try {
    const row = await queryOne<{ payload: string }>(
      `SELECT payload FROM ml_models WHERE name = ? AND is_active = 1 ORDER BY trained_at DESC, model_id DESC LIMIT 1`,
      [MODEL_NAME]
    );
    if (row) model = JSON.parse(row.payload) as WaitModel;
  } catch {
    // ml_models missing (migration pending) or corrupt payload — the baseline formula is used.
  }
  modelCache = { at: Date.now(), model };
  return model;
}

function predictSync(model: WaitModel | null, f: WaitFeatures): Omit<Prediction, 'latencyMs'> {
  if (!model) {
    return { minutes: baselineWait(f), range: null, modelVersion: BASELINE_VERSION, modelType: 'baseline' };
  }
  const minutes = predictWithModel(model, f);
  const mae = model.testMae;
  return {
    minutes,
    range: mae === null ? null : [Math.max(0, Math.round(minutes - mae)), Math.round(minutes + mae)],
    modelVersion: model.version,
    modelType: 'ml',
  };
}

/** Predicts a single wait. Latency covers model loading, i.e. what a caller actually experiences (T02). */
export async function predictWait(f: WaitFeatures): Promise<Prediction> {
  const t0 = performance.now();
  const settings = await getSettings();
  const model = settings.ai_wait_prediction_enabled ? await getActiveModel() : null;
  const p = predictSync(model, f);
  return { ...p, latencyMs: Math.round(performance.now() - t0) };
}

// ─── Context ─────────────────────────────────────────────────────────────────

/** Doctor's average consultation length: own history → specialisation default → admin default. */
export async function getDoctorAvgConsult(doctorId: number): Promise<number> {
  try {
    const hist = await queryOne<{ avg_mins: string | null }>(
      `SELECT AVG(TIMESTAMPDIFF(MINUTE, called_at, ended_at)) AS avg_mins
         FROM queue
        WHERE doctor_id = ? AND status = 'Completed'
          AND called_at IS NOT NULL AND ended_at IS NOT NULL
          AND TIMESTAMPDIFF(MINUTE, called_at, ended_at) BETWEEN 1 AND 180`,
      [doctorId]
    );
    if (hist?.avg_mins !== null && hist?.avg_mins !== undefined && Number(hist.avg_mins) > 0) {
      return Math.round(Number(hist.avg_mins) * 10) / 10;
    }
    const spec = await queryOne<{ mins: number | null }>(
      `SELECT s.typical_consultation_mins AS mins
         FROM doctors d JOIN specializations s ON s.specialization_id = d.specialization_id
        WHERE d.doctor_id = ?`,
      [doctorId]
    );
    if (spec?.mins && spec.mins > 0) return spec.mins;
  } catch (err) {
    console.error('[WaitTime avg consult]', err);
  }
  return (await getSettings()).default_consultation_minutes;
}

/** Patients a newly queued entry of the given priority would wait behind (priority first, then arrival order). */
export async function countAhead(doctorId: number, date: string, priorityLevel: number): Promise<number> {
  const row = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM queue
      WHERE doctor_id = ? AND queue_date = ? AND status IN ('Waiting','In-Progress') AND priority_level <= ?`,
    [doctorId, date, priorityLevel]
  );
  return Number(row?.n ?? 0);
}

// ─── Logging (Predictions entity) ────────────────────────────────────────────

export async function logPrediction(args: {
  queueId?: number | null;
  doctorId?: number | null;
  features: WaitFeatures;
  prediction: Prediction;
}): Promise<void> {
  const { queueId = null, doctorId = null, features: f, prediction: p } = args;
  await query(
    `INSERT INTO wait_time_predictions
       (queue_id, doctor_id, queue_length, available_doctors, avg_consultation_mins, priority_level,
        predicted_wait_minutes, model_version, model_type, latency_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [queueId, doctorId, f.patientsAhead, f.availableDoctors, f.avgConsultMinutes, f.priorityLevel,
     p.minutes, p.modelVersion, p.modelType, p.latencyMs]
  ).catch((err) => console.error('[WaitTime log]', err));
}

/** Back-fills the actual wait once a patient is called, so accuracy (MAE) can be measured. */
export async function recordActualWait(queueId: number, actualMinutes: number): Promise<void> {
  await query(
    `UPDATE wait_time_predictions SET actual_wait_minutes = ?
      WHERE queue_id = ? AND actual_wait_minutes IS NULL`,
    [actualMinutes, queueId]
  ).catch((err) => console.error('[WaitTime actual]', err));
}

/**
 * Predicts, stores and returns the wait for a freshly queued patient.
 * Best-effort: booking must never fail because prediction did.
 */
export async function predictForNewEntry(args: {
  queueId: number;
  doctorId: number;
  date: string;
  hourOfDay: number;
}): Promise<Prediction | null> {
  try {
    const priorityLevel = 4; // untriaged until a clinician assesses them
    const [avg, inQueue] = await Promise.all([
      getDoctorAvgConsult(args.doctorId),
      countAhead(args.doctorId, args.date, priorityLevel),
    ]);
    const features: WaitFeatures = {
      // The entry is already inserted, so it is counted in `inQueue`; only the others are ahead of it.
      patientsAhead: Math.max(0, inQueue - 1),
      availableDoctors: 1,
      avgConsultMinutes: avg,
      priorityLevel,
      hourOfDay: args.hourOfDay,
    };
    const prediction = await predictWait(features);
    await query('UPDATE queue SET estimated_wait_mins = ? WHERE queue_id = ?', [prediction.minutes, args.queueId]);
    await logPrediction({ queueId: args.queueId, doctorId: args.doctorId, features, prediction });
    return prediction;
  } catch (err) {
    console.error('[WaitTime predictForNewEntry]', err);
    return null;
  }
}

/**
 * Re-estimates every waiting patient for a doctor/day after the queue changed
 * (someone called, completed, triaged, skipped…). Uses the same ordering as the
 * queue itself: priority first, then arrival position.
 */
export async function recalculateQueueEstimates(doctorId: number, date: string): Promise<void> {
  const [avg, settings] = await Promise.all([getDoctorAvgConsult(doctorId), getSettings()]);
  const model = settings.ai_wait_prediction_enabled ? await getActiveModel() : null;

  const entries = await query<{ id: number; status: string; priority_level: number; hour_of_day: number }[]>(
    `SELECT q.queue_id AS id, q.status, q.priority_level, HOUR(a.appointment_datetime) AS hour_of_day
       FROM queue q JOIN appointments a ON a.appointment_id = q.appointment_id
      WHERE q.doctor_id = ? AND q.queue_date = ? AND q.status IN ('Waiting','In-Progress')
      ORDER BY (q.status = 'In-Progress') DESC, q.priority_level ASC, q.position ASC`,
    [doctorId, date]
  );

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.status !== 'Waiting') continue;
    const { minutes } = predictSync(model, {
      patientsAhead: i,
      availableDoctors: 1,
      avgConsultMinutes: avg,
      priorityLevel: Number(e.priority_level),
      hourOfDay: Number(e.hour_of_day),
    });
    await query('UPDATE queue SET estimated_wait_mins = ? WHERE queue_id = ?', [minutes, e.id]);
  }
}

// ─── Training ────────────────────────────────────────────────────────────────

/**
 * Historical consultations as training samples. The actual wait is measured from
 * the appointment time to the moment the patient was called (never negative).
 * "Patients ahead" counts the entries ranked before this one that were still
 * being seen or waiting when this patient was due.
 */
export async function loadTrainingSamples(): Promise<WaitSample[]> {
  const rows = await query<{
    wait_minutes: number; patients_ahead: number; avg_consult: string | null;
    priority_level: number; hour_of_day: number;
  }[]>(
    `SELECT GREATEST(0, TIMESTAMPDIFF(MINUTE, a.appointment_datetime, q.called_at)) AS wait_minutes,
            (SELECT COUNT(*) FROM queue q2
              WHERE q2.doctor_id = q.doctor_id AND q2.queue_date = q.queue_date
                AND q2.position < q.position
                AND q2.status IN ('Completed','In-Progress','Referred')
                AND (q2.ended_at IS NULL OR q2.ended_at > a.appointment_datetime)) AS patients_ahead,
            dc.avg_consult,
            q.priority_level,
            HOUR(a.appointment_datetime) AS hour_of_day
       FROM queue q
       JOIN appointments a ON a.appointment_id = q.appointment_id
       LEFT JOIN (
         SELECT doctor_id, AVG(TIMESTAMPDIFF(MINUTE, called_at, ended_at)) AS avg_consult
           FROM queue
          WHERE status = 'Completed' AND called_at IS NOT NULL AND ended_at IS NOT NULL
            AND TIMESTAMPDIFF(MINUTE, called_at, ended_at) BETWEEN 1 AND 180
          GROUP BY doctor_id
       ) dc ON dc.doctor_id = q.doctor_id
      WHERE q.called_at IS NOT NULL
        AND q.status IN ('In-Progress','Completed','Referred')
        AND TIMESTAMPDIFF(MINUTE, a.appointment_datetime, q.called_at) < 480
      ORDER BY q.queue_id DESC
      LIMIT 5000`
  );

  const fallback = (await getSettings()).default_consultation_minutes;
  return rows.map((r) => ({
    patientsAhead: Number(r.patients_ahead),
    availableDoctors: 1,
    avgConsultMinutes: r.avg_consult !== null && Number(r.avg_consult) > 0 ? Number(r.avg_consult) : fallback,
    priorityLevel: Number(r.priority_level) || 4,
    hourOfDay: Number(r.hour_of_day),
    actualWaitMinutes: Number(r.wait_minutes),
  }));
}

export interface TrainingOutcome extends TrainResult {
  saved: boolean;
  activated: boolean;
  modelId: number | null;
  samplesUsed: number;
}

export async function trainAndSaveModel(userId: number): Promise<TrainingOutcome> {
  const settings = await getSettings();
  const samples = await loadTrainingSamples();
  const result = trainWaitModel(samples, { minSamples: settings.ml_min_training_samples });

  if (!result.model) {
    return { ...result, saved: false, activated: false, modelId: null, samplesUsed: samples.length };
  }

  if (result.accepted) {
    await query(`UPDATE ml_models SET is_active = 0 WHERE name = ?`, [MODEL_NAME]);
  }
  const insert = await query<{ insertId: number }>(
    `INSERT INTO ml_models
       (name, version, algorithm, payload, training_samples, test_samples,
        test_mae_minutes, baseline_mae, test_within_5, is_active, trained_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [MODEL_NAME, result.model.version, result.model.algorithm, JSON.stringify(result.model),
     result.model.trainingSamples, result.test.n, result.test.mae, result.baselineTest.mae,
     result.test.within5Pct, result.accepted ? 1 : 0, userId]
  );
  invalidateModelCache();
  return {
    ...result,
    saved: true,
    activated: result.accepted,
    modelId: (insert as unknown as { insertId: number }).insertId,
    samplesUsed: samples.length,
  };
}

// ─── Accuracy monitoring ─────────────────────────────────────────────────────

export interface AccuracyReport {
  windowDays: number;
  /** Predictions that have since been compared with the real wait. */
  measured: number;
  maeMinutes: number | null;
  within5Pct: number | null;
  /** All predictions in the window, measured or not. */
  totalPredictions: number;
  avgLatencyMs: number | null;
  within3sPct: number | null;
  byModel: { modelVersion: string; modelType: string; n: number; maeMinutes: number; within5Pct: number }[];
  activeModel: { version: string; trainedAt: string; testMae: number | null; trainingSamples: number } | null;
}

export async function getAccuracyReport(windowDays = 30): Promise<AccuracyReport> {
  const empty: AccuracyReport = {
    windowDays, measured: 0, maeMinutes: null, within5Pct: null, totalPredictions: 0,
    avgLatencyMs: null, within3sPct: null, byModel: [], activeModel: null,
  };
  try {
    const [byModel, latency, model] = await Promise.all([
      query<{ model_version: string; model_type: string; n: number; mae: string; within5: string }[]>(
        `SELECT model_version, model_type, COUNT(*) AS n,
                AVG(ABS(predicted_wait_minutes - actual_wait_minutes)) AS mae,
                AVG(CASE WHEN ABS(predicted_wait_minutes - actual_wait_minutes) <= 5 THEN 1 ELSE 0 END) * 100 AS within5
           FROM wait_time_predictions
          WHERE actual_wait_minutes IS NOT NULL AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
          GROUP BY model_version, model_type
          ORDER BY MAX(created_at) DESC`,
        [windowDays]
      ),
      queryOne<{ total: number; avg_latency: string | null; within3: string | null }>(
        `SELECT COUNT(*) AS total, AVG(latency_ms) AS avg_latency,
                AVG(CASE WHEN latency_ms <= 3000 THEN 1 ELSE 0 END) * 100 AS within3
           FROM wait_time_predictions WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [windowDays]
      ),
      getActiveModel(),
    ]);

    const measured = byModel.reduce((s, r) => s + Number(r.n), 0);
    const weighted = (pick: (r: (typeof byModel)[number]) => number) =>
      measured ? byModel.reduce((s, r) => s + pick(r) * Number(r.n), 0) / measured : null;
    const round = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

    return {
      windowDays,
      measured,
      maeMinutes: round(weighted((r) => Number(r.mae))),
      within5Pct: round(weighted((r) => Number(r.within5))),
      totalPredictions: Number(latency?.total ?? 0),
      avgLatencyMs: latency?.avg_latency != null ? round(Number(latency.avg_latency)) : null,
      within3sPct: latency?.within3 != null ? round(Number(latency.within3)) : null,
      byModel: byModel.map((r) => ({
        modelVersion: r.model_version,
        modelType: r.model_type,
        n: Number(r.n),
        maeMinutes: round(Number(r.mae)) ?? 0,
        within5Pct: round(Number(r.within5)) ?? 0,
      })),
      activeModel: model
        ? { version: model.version, trainedAt: model.trainedAt, testMae: model.testMae, trainingSamples: model.trainingSamples }
        : null,
    };
  } catch (err) {
    console.error('[WaitTime accuracy]', err);
    return empty;
  }
}
