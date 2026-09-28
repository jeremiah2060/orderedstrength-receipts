#!/usr/bin/env node
// promise-verdict.mjs — the one rule this repository grades a sealed promise by.

// ── PROTOCOL 2: A PROMISE, GRADED HERE FROM ITS OWN FACTS (2026-09-27) ─────────
// A promise ("100 kg for 5 at reserve 2, 80 percent sure", or "estimated max 145 kg by a date, 63
// percent sure") commits the sureness Jerry STATED. The phone sends its verdict and the facts it
// rested on; this file ignores the verdict and re-derives it from the facts with the app's own rule,
// restated below, so the calibration published is arithmetic anyone can redo. A promise whose facts
// cannot decide it (not the promised load, a reserve that was not typed, stopped short with reps to
// spare) was never tested and is counted as not graded, never as kept or broken.
const KG_SCALE = 10000;           // the app commits kilograms at four decimal places as integers
const LOAD_TOLERANCE_KG = 0.5;    // the app's compliance door: within half a kilogram is the asked load
const INTEGER = /^-?\d{1,19}$/;
export function promiseVerdict(field, outcome) {
  const facts = new Map((Array.isArray(outcome) ? outcome : []).map(f => [f && f.key, f && f.value]));
  const num = (v) => (typeof v === 'string' && INTEGER.test(v)) ? Number(v) : NaN;
  const stated = num(field('statedPercent'));
  if (!Number.isInteger(stated) || stated < 1 || stated > 99) return null;
  switch (field('kind')) {
    case 'set-promise': {
      const load = num(field('loadKg')) / KG_SCALE, reps = num(field('reps')), reserve = num(field('reserve'));
      const loggedKg = num(facts.get('loggedKg')) / KG_SCALE;
      const loggedReps = num(facts.get('loggedReps')), typed = num(facts.get('typedReserve'));
      if (![load, reps, reserve, loggedKg, loggedReps, typed].every(Number.isFinite)) return null;
      if (Math.abs(loggedKg - load) > LOAD_TOLERANCE_KG) return null;              // not the promised set
      if (loggedReps + Math.max(0, typed) < reps + reserve) return { stated, kept: false };
      if (loggedReps < reps) return null;                                            // capacity to spare, untested
      return { stated, kept: true };
    }
    case 'goal-date': {
      const target = num(field('targetKg')) / KG_SCALE, measured = num(facts.get('estimatedMaxKg')) / KG_SCALE;
      if (![target, measured].every(Number.isFinite)) return null;
      return { stated, kept: measured >= target };
    }
    default: return null;
  }
}
// The stated sureness in bands of ten points. A calibrated coach's 80 percent comes true about 8 times in 10.
export const PROMISE_BANDS = [[50, 59], [60, 69], [70, 79], [80, 89], [90, 99]];
