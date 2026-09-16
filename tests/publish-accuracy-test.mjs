// publish-accuracy-test.mjs — proves the grader grades, and proves it refuses.
//
// Runs against a THROWAWAY COPY of this repository and a fake record API, so nothing real is
// touched and no network is needed.
//
// 🔒 THE REFUSALS ARE THE POINT. A grader that only proves it can compute a percentage is a
// grader nobody has tested where it matters: the cases it must throw away are what keep the
// published number honest. Four of the ten checks below are refusals, and each maps to a
// sentence on the website.
//
// Usage: node tests/publish-accuracy-test.mjs
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'os-accuracy-proof-'));
const PORT = 8912 + (process.pid % 50);
// A CLOSED month, derived rather than typed: the script refuses an open one, which is a check
// below rather than an inconvenience here.
const now = new Date();
const closed = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
const MONTH = closed.toISOString().slice(0, 7);

let passed = 0, failed = 0;
const check = (name, cond) => {
  if (cond) { passed++; console.log(`PASS: ${name}`); }
  else { failed++; console.error(`FAIL: ${name}`); }
};

const lp = (s) => {
  const b = Buffer.from(s, 'utf8');
  const len = Buffer.alloc(8);
  len.writeBigUInt64BE(BigInt(b.length));
  return Buffer.concat([len, b]);
};
const digest = (fields, nonceHex) => crypto.createHash('sha256')
  .update(Buffer.concat([lp(String(fields.length)), ...fields.flatMap(f => [lp(f.key), lp(f.value)]),
                         Buffer.from(nonceHex, 'hex')])).digest('hex');

const sealedFor = String(Date.UTC(Number(MONTH.slice(0, 4)), Number(MONTH.slice(5, 7)) - 1, 6) / 1000);
function reveal({ low, high, actual, athlete, nonce }) {
  const fields = [
    { key: 'kind', value: 'session-forecast' },
    { key: 'exercise', value: 'Back Squat' },
    { key: 'bandLowKg', value: low },
    { key: 'bandHighKg', value: high },
    { key: 'naiveBaselineKg', value: '1020000' },
    { key: 'sealedFor', value: sealedFor },
  ];
  return { fields, nonce, commitment: digest(fields, nonce), actual, athlete };
}
const n = (i) => String(i).padStart(2, '0').repeat(32).slice(0, 64);
const who = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Three athletes, four gradeable calls, three inside the band.
const hit1 = reveal({ low: '1000000', high: '1100000', actual: '1050000', athlete: who('a'), nonce: n(1) });
const hit2 = reveal({ low: '1000000', high: '1100000', actual: '1100000', athlete: who('b'), nonce: n(2) });
const hit3 = reveal({ low: '900000', high: '1000000', actual: '900000', athlete: who('b'), nonce: n(3) });
const miss = reveal({ low: '1000000', high: '1100000', actual: '1200000', athlete: who('c'), nonce: n(4) });
// Never anchored: nothing proves it predates its own result.
const orphan = reveal({ low: '1000000', high: '1100000', actual: '1000000', athlete: who('d'), nonce: n(5) });
// Edited after sealing: the fingerprint no longer recomputes.
const edited = reveal({ low: '1000000', high: '1100000', actual: '1000000', athlete: who('e'), nonce: n(6) });
edited.fields = edited.fields.map(f => (f.key === 'bandLowKg' ? { key: f.key, value: '1' } : f));

const server = createServer((req, res) => {
  if (req.url === `/api/v1/record/month/${MONTH}`) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ month: MONTH, count: 6, athletes: 5,
      reveals: [hit1, hit2, hit3, miss, orphan, edited] }));
  }
  res.writeHead(404); res.end();
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

fs.cpSync(ROOT, WORK, { recursive: true, filter: (src) => !src.includes(`${path.sep}.git${path.sep}`) });
fs.rmSync(path.join(WORK, 'accuracy'), { recursive: true, force: true });
fs.mkdirSync(path.join(WORK, 'leaves'), { recursive: true });
// One published day holding every fingerprint except the orphan's.
fs.writeFileSync(path.join(WORK, 'leaves', `${MONTH}-06.txt`),
  [hit1, hit2, hit3, miss, edited].map(r => r.commitment).sort().join('\n') + '\n');

// 🔒 ASYNC, BECAUSE THE FAKE API LIVES IN THIS PROCESS. A blocking child cannot be answered by a
// blocked parent: the first draft used execFileSync and deadlocked for two minutes.
const run = (month) => new Promise((resolve) => {
  const child = spawn('node', ['scripts/publish-accuracy.mjs', month],
    { cwd: WORK, env: { ...process.env, OS_ANCHOR_API: `http://127.0.0.1:${PORT}` } });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  child.on('close', () => resolve(out));
});

console.log('  ' + (await run(MONTH)).trim().split('\n').join('\n  '));
const doc = JSON.parse(fs.readFileSync(path.join(WORK, 'accuracy', `${MONTH}.json`), 'utf8'));
const calls = JSON.parse(fs.readFileSync(path.join(WORK, 'accuracy', `${MONTH}-calls.json`), 'utf8'));

check('it graded only the anchored, recomputing reveals', doc.graded === 4);
check('it counted the calls inside the band', doc.within === 3);
check('the rate is those two numbers and nothing else', doc.rate === 0.75);
check('the athlete count is DISTINCT athletes (a, b, b, c = 3)', doc.athletes === 3);
check('an unanchored reveal is disclosed, never graded', doc.notGraded.unanchored === 1);
check('an edited reveal is disclosed as not recomputing', doc.notGraded.didNotRecompute === 1);
check('every graded call is published so a stranger can redo it',
  calls.calls.length === 4 && calls.calls.every(c => c.nonce && c.fields && c.anchoredIn === `${MONTH}-06`));
check('the unanchored one is absent from the published calls',
  !calls.calls.some(c => c.commitment === orphan.commitment));

const before = fs.readFileSync(path.join(WORK, 'accuracy', `${MONTH}.json`), 'utf8');
const second = await run(MONTH);
check('a month already published is never rewritten',
  /already published/.test(second) &&
  fs.readFileSync(path.join(WORK, 'accuracy', `${MONTH}.json`), 'utf8') === before);

const open = await run(new Date().toISOString().slice(0, 7));
check('this month is refused, because an open month has no final rate', /REFUSED/.test(open));

server.close();
fs.rmSync(WORK, { recursive: true, force: true });
console.log(`\npublish-accuracy-test: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
