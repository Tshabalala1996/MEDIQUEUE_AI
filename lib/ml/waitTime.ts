/**
 * Waiting-time prediction model (FR03 / T01 / T02).
 *
 * Pure functions only — no database, no I/O — so the maths can be unit-verified
 * (see scripts/verify-requirements.mjs) and reused by the service layer.
 *
 * Algorithm: ridge regression on standardised features, trained on the
 * facility's own queue history. A transparent queueing formula
 * (patients ahead × average consultation ÷ doctors) is kept as the baseline;
 * a trained model is only accepted when it beats that baseline on a hold-out set.
 */

export interface WaitFeatures {
  /** Patients ranked ahead (including the one currently being served). */
  patientsAhead: number;
  /** Doctors serving this queue. Queues here are per-doctor, so normally 1. */
  availableDoctors: number;
  avgConsultMinutes: number;
  /** 1 (Red) … 4 (Green / untriaged). */
  priorityLevel: number;
  /** 0–23. */
  hourOfDay: number;
}

export interface WaitSample extends WaitFeatures {
  actualWaitMinutes: number;
}

export interface WaitModel {
  version: string;
  algorithm: 'ridge-regression';
  featureNames: string[];
  means: number[];
  stds: number[];
  weights: number[];
  intercept: number;
  lambda: number;
  trainedAt: string;
  trainingSamples: number;
  /** Hold-out MAE recorded at training time; used for the ± range shown to users. */
  testMae: number | null;
}

export interface Metrics {
  n: number;
  mae: number;
  rmse: number;
  /** Share (0–100) of predictions within ±5 minutes of the actual wait. */
  within5Pct: number;
}

export const FEATURE_NAMES = [
  'expected_queue_minutes',
  'patients_ahead',
  'avg_consult_minutes',
  'priority_level',
  'hour_of_day',
];

export function toVector(f: WaitFeatures): number[] {
  const doctors = Math.max(1, f.availableDoctors);
  return [
    (f.patientsAhead * f.avgConsultMinutes) / doctors,
    f.patientsAhead,
    f.avgConsultMinutes,
    f.priorityLevel,
    f.hourOfDay,
  ];
}

/** Transparent queueing baseline — also the fallback when no trained model is active. */
export function baselineWait(f: WaitFeatures): number {
  return Math.max(0, Math.round(toVector(f)[0]));
}

export function predictWithModel(model: WaitModel, f: WaitFeatures): number {
  const x = toVector(f);
  let y = model.intercept;
  for (let i = 0; i < x.length; i++) {
    y += model.weights[i] * ((x[i] - model.means[i]) / model.stds[i]);
  }
  return Math.max(0, Math.round(y));
}

export function evaluate(samples: WaitSample[], predict: (f: WaitFeatures) => number): Metrics {
  if (!samples.length) return { n: 0, mae: 0, rmse: 0, within5Pct: 0 };
  let abs = 0;
  let sq = 0;
  let within = 0;
  for (const s of samples) {
    const err = predict(s) - s.actualWaitMinutes;
    abs += Math.abs(err);
    sq += err * err;
    if (Math.abs(err) <= 5) within++;
  }
  const n = samples.length;
  return {
    n,
    mae: round2(abs / n),
    rmse: round2(Math.sqrt(sq / n)),
    within5Pct: round2((within / n) * 100),
  };
}

// ─── Training ────────────────────────────────────────────────────────────────

export interface TrainOptions {
  lambda?: number;
  testFraction?: number;
  seed?: number;
  minSamples?: number;
  version?: string;
  now?: Date;
}

export interface TrainResult {
  model: WaitModel | null;
  accepted: boolean;
  reason: string;
  train: Metrics;
  test: Metrics;
  baselineTest: Metrics;
}

const EMPTY: Metrics = { n: 0, mae: 0, rmse: 0, within5Pct: 0 };

export function trainWaitModel(all: WaitSample[], opts: TrainOptions = {}): TrainResult {
  const { lambda = 1, testFraction = 0.2, seed = 42, minSamples = 30, now = new Date() } = opts;

  const samples = all.filter(
    (s) =>
      Number.isFinite(s.actualWaitMinutes) &&
      s.actualWaitMinutes >= 0 &&
      toVector(s).every(Number.isFinite)
  );

  if (samples.length < minSamples) {
    return {
      model: null,
      accepted: false,
      reason: `Not enough completed consultations to train (${samples.length} of ${minSamples} required). Using the queueing baseline.`,
      train: EMPTY,
      test: EMPTY,
      baselineTest: EMPTY,
    };
  }

  const shuffled = seededShuffle(samples, seed);
  const testSize = Math.max(1, Math.round(shuffled.length * testFraction));
  const test = shuffled.slice(0, testSize);
  const train = shuffled.slice(testSize);

  const holdoutModel = fit(train, lambda, now, opts.version, null);
  const trainMetrics = evaluate(train, (f) => predictWithModel(holdoutModel, f));
  const testMetrics = evaluate(test, (f) => predictWithModel(holdoutModel, f));
  const baselineTest = evaluate(test, baselineWait);

  // Deployed model is refit on every sample; the recorded MAE is the honest hold-out figure.
  const model = fit(samples, lambda, now, opts.version, testMetrics.mae);

  const accepted = testMetrics.mae <= baselineTest.mae;
  return {
    model,
    accepted,
    reason: accepted
      ? `Model beats the queueing baseline on the hold-out set (MAE ${testMetrics.mae} vs ${baselineTest.mae} min).`
      : `Model did not beat the queueing baseline on the hold-out set (MAE ${testMetrics.mae} vs ${baselineTest.mae} min); keeping the baseline.`,
    train: trainMetrics,
    test: testMetrics,
    baselineTest,
  };
}

function fit(
  samples: WaitSample[],
  lambda: number,
  now: Date,
  version: string | undefined,
  testMae: number | null
): WaitModel {
  const X = samples.map(toVector);
  const y = samples.map((s) => s.actualWaitMinutes);
  const n = X.length;
  const p = FEATURE_NAMES.length;

  const means = new Array<number>(p).fill(0);
  const stds = new Array<number>(p).fill(1);
  for (let j = 0; j < p; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += X[i][j];
    means[j] = sum / n;
    let variance = 0;
    for (let i = 0; i < n; i++) variance += (X[i][j] - means[j]) ** 2;
    const sd = Math.sqrt(variance / n);
    // A constant feature (e.g. one doctor per queue) carries no signal: leave it at 0 after scaling.
    stds[j] = sd < 1e-9 ? 1 : sd;
  }

  const yMean = y.reduce((a, b) => a + b, 0) / n;
  const Z = X.map((row) => row.map((v, j) => (v - means[j]) / stds[j]));

  // Normal equations for ridge: (ZᵀZ + λI) w = Zᵀ(y − ȳ)
  const A: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const b = new Array<number>(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      b[j] += Z[i][j] * (y[i] - yMean);
      for (let k = 0; k < p; k++) A[j][k] += Z[i][j] * Z[i][k];
    }
  }
  for (let j = 0; j < p; j++) A[j][j] += lambda;

  const weights = solve(A, b);

  return {
    version: version ?? `wt-${now.toISOString().slice(0, 16).replace(/[-:T]/g, '')}`,
    algorithm: 'ridge-regression',
    featureNames: FEATURE_NAMES,
    means,
    stds,
    weights,
    intercept: yMean,
    lambda,
    trainedAt: now.toISOString(),
    trainingSamples: n,
    testMae,
  };
}

/** Gaussian elimination with partial pivoting. Ridge's λI keeps the system non-singular. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const div = M[col][col];
    if (Math.abs(div) < 1e-12) continue;
    for (let c = col; c <= n; c++) M[col][c] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed >>> 0;
  const rand = () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatWait(minutes: number): string {
  if (minutes < 60) return `~${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `~${h}h ${m}m` : `~${h}h`;
}
