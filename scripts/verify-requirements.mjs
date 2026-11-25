/**
 * Offline verification of the AI/decision logic behind FR03 (wait-time prediction)
 * and FR04 (triage). Runs without a database:
 *
 *   npm run verify
 *
 * IMPORTANT: this proves the *implementation* is correct (scoring bands, solver,
 * metrics, acceptance gate, latency). It does NOT prove the model reaches
 * MAE <= 5 min or 90% emergency sensitivity on your real data — that has to be
 * measured on real history via the admin "Train model" action and a clinically
 * validated triage dataset respectively.
 */
import { trainWaitModel, evaluate, baselineWait, predictWithModel } from '../lib/ml/waitTime.ts';
import { suggestTriage, categoryFromTews } from '../lib/triage.ts';

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n      ${err.message.split('\n')[0]}`);
  }
}
const eq = (a, b) => { if (a !== b) throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, msg) => { if (!c) throw new Error(msg); };

// ── Triage (FR04 / T03 logic) ────────────────────────────────────────────────
console.log('\nTriage — TEWS bands (SATS adult)');
check('TEWS 0-2 → Green', () => { eq(categoryFromTews(0), 'Green'); eq(categoryFromTews(2), 'Green'); });
check('TEWS 3-4 → Yellow', () => { eq(categoryFromTews(3), 'Yellow'); eq(categoryFromTews(4), 'Yellow'); });
check('TEWS 5-6 → Orange', () => { eq(categoryFromTews(5), 'Orange'); eq(categoryFromTews(6), 'Orange'); });
check('TEWS 7+ → Red', () => { eq(categoryFromTews(7), 'Red'); eq(categoryFromTews(12), 'Red'); });

console.log('\nTriage — vignettes');
const healthy = { vitals: { respiratoryRate: 16, heartRate: 80, systolicBp: 120, temperatureC: 36.8 }, avpu: 'Alert', mobility: 'Walking' };
check('healthy adult (RR16 HR80 BP120 T36.8): TEWS 1 → Green, high confidence', () => {
  const s = suggestTriage(healthy);
  eq(s.category, 'Green'); eq(s.tewsScore, 1); eq(s.confidence, 'high'); eq(s.priority, 4);
});
check('RR22 + HR105 → TEWS 3 → Yellow', () => {
  const s = suggestTriage({ vitals: { respiratoryRate: 22, heartRate: 105, systolicBp: 120, temperatureC: 37 }, avpu: 'Alert', mobility: 'Walking' });
  eq(s.tewsScore, 3); eq(s.category, 'Yellow');
});
check('RR25 HR115 T39 → TEWS 6 → Orange', () => {
  const s = suggestTriage({ vitals: { respiratoryRate: 25, heartRate: 115, systolicBp: 120, temperatureC: 39 }, avpu: 'Alert', mobility: 'Walking' });
  eq(s.tewsScore, 6); eq(s.category, 'Orange');
});
check('RR32 HR135 SBP70 → TEWS 9 → Red', () => {
  const s = suggestTriage({ vitals: { respiratoryRate: 32, heartRate: 135, systolicBp: 70, temperatureC: 37 }, avpu: 'Alert', mobility: 'Walking' });
  eq(s.tewsScore, 9); eq(s.category, 'Red'); eq(s.priority, 1);
});
check('current seizure overrides normal vitals → Red', () => {
  eq(suggestTriage({ ...healthy, discriminators: ['seizure_current'] }).category, 'Red');
});
check('chest pain with normal vitals → Orange (never downgraded by a good TEWS)', () => {
  eq(suggestTriage({ ...healthy, discriminators: ['chest_pain'] }).category, 'Orange');
});
check('most urgent signal wins (chest pain + TEWS 9) → Red', () => {
  const s = suggestTriage({ vitals: { respiratoryRate: 32, heartRate: 135, systolicBp: 70 }, discriminators: ['chest_pain'] });
  eq(s.category, 'Red');
});
check('hypoglycaemia (glucose 2.5) → Red', () => {
  eq(suggestTriage({ ...healthy, vitals: { ...healthy.vitals, glucoseMmol: 2.5 } }).category, 'Red');
});
check('SpO2 88% → at least Orange; 80% → Red', () => {
  eq(suggestTriage({ ...healthy, vitals: { ...healthy.vitals, spo2: 88 } }).category, 'Orange');
  eq(suggestTriage({ ...healthy, vitals: { ...healthy.vitals, spo2: 80 } }).category, 'Red');
});
check('unresponsive AVPU adds 3 to the score', () => {
  const base = suggestTriage(healthy).tewsScore;
  eq(suggestTriage({ ...healthy, avpu: 'Unresponsive' }).tewsScore, base + 3);
});
check('child (<13): adult TEWS not applied, clinician must decide', () => {
  const s = suggestTriage({ ...healthy, ageYears: 8 });
  eq(s.tewsScore, null); eq(s.requiresManual, true); eq(s.category, null);
});
check('child with a discriminator still escalates', () => {
  const s = suggestTriage({ ageYears: 8, discriminators: ['seizure_current'] });
  eq(s.category, 'Red'); eq(s.requiresManual, true);
});
check('symptoms-only fallback is conservative: severe → Yellow, never Red/Orange, low confidence', () => {
  const s = suggestTriage({ symptoms: [{ severity: 'Severe' }, { severity: 'Mild' }] });
  eq(s.category, 'Yellow'); eq(s.confidence, 'low'); eq(s.requiresManual, true);
});
check('no information → no suggestion (does not guess)', () => {
  const s = suggestTriage({});
  eq(s.category, null); eq(s.requiresManual, true);
});
check('unknown discriminator ids are ignored, not trusted', () => {
  eq(suggestTriage({ ...healthy, discriminators: ['not_a_real_id'] }).category, 'Green');
});
check('all emergent vignettes are flagged Red/Orange (regression set — NOT clinical validation)', () => {
  const emergent = [
    { ...healthy, discriminators: ['airway_compromised'] },
    { ...healthy, discriminators: ['cardiac_arrest'] },
    { ...healthy, discriminators: ['major_haemorrhage'] },
    { ...healthy, discriminators: ['focal_neurology'] },
    { ...healthy, discriminators: ['overdose_poisoning'] },
    { vitals: { respiratoryRate: 30, heartRate: 140, systolicBp: 65 }, avpu: 'Pain' },
    { vitals: { respiratoryRate: 24, heartRate: 118, systolicBp: 95, temperatureC: 39.2 }, avpu: 'Voice', mobility: 'WithHelp' },
  ];
  const hit = emergent.filter((c) => ['Red', 'Orange'].includes(suggestTriage(c).category)).length;
  eq(hit, emergent.length);
});

// ── Wait-time model (FR03 / T01 / T02 logic) ─────────────────────────────────
console.log('\nWait-time model');

// Deterministic RNG so the run is reproducible.
let seed = 7;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

function makeSamples(n, truth) {
  return Array.from({ length: n }, () => {
    const f = {
      patientsAhead: Math.floor(rand() * 15),
      availableDoctors: 1,
      avgConsultMinutes: 8 + Math.floor(rand() * 20),
      priorityLevel: 1 + Math.floor(rand() * 4),
      hourOfDay: 7 + Math.floor(rand() * 10),
    };
    return { ...f, actualWaitMinutes: Math.max(0, Math.round(truth(f))) };
  });
}

// Reality: clinics run a bit slower than the naive formula, and later in the day.
const learnable = (f) => 0.8 * f.patientsAhead * f.avgConsultMinutes + 1.2 * (f.hourOfDay - 7) + 3 + 2 * gauss();
const data = makeSamples(500, learnable);
const result = trainWaitModel(data, { now: new Date('2026-01-01T00:00:00Z') });

check('trains and is accepted when it beats the queueing baseline', () => ok(result.accepted, result.reason));
check('hold-out MAE is well under the T01 target of 5 minutes on learnable data', () => ok(result.test.mae <= 5, `MAE ${result.test.mae}`));
check('model beats the baseline formula on the hold-out set', () => ok(result.test.mae < result.baselineTest.mae, `${result.test.mae} vs ${result.baselineTest.mae}`));
check('records hold-out MAE and sample count on the model', () => { eq(result.model.testMae, result.test.mae); eq(result.model.trainingSamples, 500); });
check('predictions are non-negative integers', () => {
  const p = predictWithModel(result.model, { patientsAhead: 0, availableDoctors: 1, avgConsultMinutes: 10, priorityLevel: 4, hourOfDay: 7 });
  ok(Number.isInteger(p) && p >= 0, `got ${p}`);
});
check('more patients ahead → longer predicted wait', () => {
  const at = (n) => predictWithModel(result.model, { patientsAhead: n, availableDoctors: 1, avgConsultMinutes: 15, priorityLevel: 4, hourOfDay: 10 });
  ok(at(10) > at(2), `${at(2)} vs ${at(10)}`);
});
check('refuses to train on too little data and falls back to the baseline', () => {
  const r = trainWaitModel(makeSamples(10, learnable));
  eq(r.model, null); eq(r.accepted, false);
});
check('rejects a model that cannot beat a baseline that is already exact', () => {
  const exact = makeSamples(300, (f) => (f.patientsAhead * f.avgConsultMinutes) / f.availableDoctors);
  const r = trainWaitModel(exact);
  eq(r.accepted, false);
});
check('constant features (one doctor per queue) do not break the solver', () => {
  ok(result.model.weights.every(Number.isFinite), 'non-finite weight');
});
check('same seed → identical model (reproducible training)', () => {
  const again = trainWaitModel(data, { now: new Date('2026-01-01T00:00:00Z') });
  eq(JSON.stringify(again.model), JSON.stringify(result.model));
});
check('evaluate() computes MAE / ±5-minute share correctly', () => {
  const m = evaluate(
    [{ ...data[0], actualWaitMinutes: 10 }, { ...data[0], actualWaitMinutes: 20 }],
    () => 12
  );
  eq(m.mae, 5); eq(m.within5Pct, 50); // errors: 2 and -8
});
check('baselineWait = patients ahead × avg consult ÷ doctors', () => {
  eq(baselineWait({ patientsAhead: 15, availableDoctors: 3, avgConsultMinutes: 12, priorityLevel: 4, hourOfDay: 9 }), 60);
});

check('T02 latency: 10,000 predictions, p95 far below 3 s', () => {
  const times = [];
  for (let i = 0; i < 10000; i++) {
    const t0 = performance.now();
    predictWithModel(result.model, { patientsAhead: i % 20, availableDoctors: 1, avgConsultMinutes: 15, priorityLevel: 1 + (i % 4), hourOfDay: 7 + (i % 10) });
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const p95 = times[Math.floor(times.length * 0.95)];
  console.log(`      p95 = ${p95.toFixed(4)} ms (model inference only; excludes DB and network)`);
  ok(p95 < 3000, `p95 ${p95}ms`);
});

console.log(`\n${result.reason}`);
console.log(`hold-out: MAE ${result.test.mae} min, RMSE ${result.test.rmse}, within ±5 min ${result.test.within5Pct}%  (baseline MAE ${result.baselineTest.mae})`);
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
