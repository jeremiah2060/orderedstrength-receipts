// node --test scripts/promise-verdict.test.mjs
// The rule is the app's own (`PromiseMath.gradeSet`, `PromiseLedger.swift`), restated. Each case names
// the outcome that would turn it red if the rule drifted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { promiseVerdict } from './promise-verdict.mjs';

const kg = (x) => String(Math.round(x * 10000));
const setPromise = (over = {}) => {
  const f = { protocol: '2', kind: 'set-promise', exercise: 'Barbell Back Squat', loadKg: kg(100), reps: '5', reserve: '2', statedPercent: '80', ...over };
  return (k) => f[k];
};
const facts = (loggedKg, loggedReps, typedReserve) => [
  { key: 'loggedKg', value: kg(loggedKg) }, { key: 'loggedReps', value: String(loggedReps) },
  ...(typedReserve === undefined ? [] : [{ key: 'typedReserve', value: String(typedReserve) }]),
];

test('kept: the promised load, the reps, and the capacity for the reserve', () => {
  assert.deepEqual(promiseVerdict(setPromise(), facts(100, 5, 2)), { stated: 80, kept: true });
});
test('broken: less capacity than reps plus reserve', () => {
  assert.deepEqual(promiseVerdict(setPromise(), facts(100, 5, 1)), { stated: 80, kept: false });
});
test('more reps and less reserve at the same capacity is kept (capacity is what was promised)', () => {
  assert.deepEqual(promiseVerdict(setPromise(), facts(100, 6, 1)), { stated: 80, kept: true });
});
test('stopped short with capacity to spare was never tested', () => {
  assert.equal(promiseVerdict(setPromise(), facts(100, 4, 4)), null);
});
test('a reserve that was not typed is never graded', () => {
  assert.equal(promiseVerdict(setPromise(), facts(100, 5)), null);
});
test('a different load is not the promised set (the app treats 0.5 kg as the ask)', () => {
  assert.deepEqual(promiseVerdict(setPromise(), facts(100.5, 5, 2)), { stated: 80, kept: true });
  assert.equal(promiseVerdict(setPromise(), facts(102.5, 5, 2)), null);
});
test('a goal date is kept when the estimated max reached the target', () => {
  const goal = (k) => ({ protocol: '2', kind: 'goal-date', exercise: 'Bench', targetKg: kg(145), statedPercent: '63' })[k];
  assert.deepEqual(promiseVerdict(goal, [{ key: 'estimatedMaxKg', value: kg(145) }]), { stated: 63, kept: true });
  assert.deepEqual(promiseVerdict(goal, [{ key: 'estimatedMaxKg', value: kg(144.9) }]), { stated: 63, kept: false });
});
test('a stated sureness outside 1 to 99, or a non-integer fact, refuses', () => {
  assert.equal(promiseVerdict(setPromise({ statedPercent: '100' }), facts(100, 5, 2)), null);
  assert.equal(promiseVerdict(setPromise(), [{ key: 'loggedKg', value: '1e6' }]), null);
});
