#!/usr/bin/env node
// publish-accuracy.mjs — grade one closed month and write the result into this repository.
//
// This is the second half of the record. `publish-anchor.mjs` publishes a day's fingerprints,
// which proves predictions EXISTED before their results. This publishes what those predictions
// SAID and whether they were right.
//
// ═══════════════════════════════════════════════════════════════════════════════
// IT GRADES HERE, AND THAT IS THE WHOLE DESIGN
// ═══════════════════════════════════════════════════════════════════════════════
// The server could compute a percentage and hand it over. Then the number would be our word
// again, which is the one thing this record exists to replace. So the server states only facts
// it can prove (here is the opened prediction, its random nonce, its outcome) and the arithmetic
// happens HERE, in public, in a repository whose commits GitHub timestamps, from data published
// beside the answer so that any stranger can redo every step.
//
// ═══════════════════════════════════════════════════════════════════════════════
// FOUR REFUSALS, AND EACH ONE IS A PROMISE ON THE WEBSITE
// ═══════════════════════════════════════════════════════════════════════════════
// 1. NEVER OVERWRITE. A month already here is finished. Republishing a different rate for a
//    published month is indistinguishable from rewriting our own report card.
// 2. NEVER PUBLISH AN OPEN MONTH. A month still receiving reveals would grade differently
//    tomorrow, and two rates for one month is the same defect as two roots for one day.
// 3. NEVER COUNT AN UNANCHORED PREDICTION. A reveal whose fingerprint is not inside a day
//    already published here proves nothing about WHEN it was made, which is the entire claim.
//    Those are counted and named in the file, never graded.
// 4. NEVER GRADE WHAT DOES NOT RECOMPUTE. The fingerprint is rebuilt from the revealed fields
//    and nonce by this file's own implementation of the encoding. A mismatch is refused.
//
// 🔒 AND THE ATHLETE COUNT IS PUBLISHED BESIDE THE RATE, ALWAYS. A rate over hundreds of
// predictions from three people reads as a rate from a crowd. The file states both, so the
// reader is never left to assume the number that flatters us.
//
// Usage: node scripts/publish-accuracy.mjs [YYYY-MM]

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const API = process.env.OS_ANCHOR_API || 'https://api.orderedstrength.com';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SCHEME = 'os-reveal-v1-sha256';
const HEX64 = /^[0-9a-f]{64}$/;

function fail(message) { console.error(`REFUSED: ${message}`); process.exit(1); }
function done(message) { console.log(message); process.exit(0); }

// ── The commitment encoding, restated independently ─────────────────────────
//   LP(x)     = 8-byte big-endian length of x, then its UTF-8 bytes
//   canonical = LP(fieldCount) || for each field in order: LP(key) || LP(value)
//   digest    = SHA256(canonical || the raw nonce bytes)
// This is the sixth implementation of one encoding (Swift, the server, and here, plus the three
// the Merkle construction already has). The redundancy is the point: a digest that disagrees
// with the sealer is indistinguishable from us inventing the prediction.
function lp(str) {
  const b = Buffer.from(str, 'utf8');
  const len = Buffer.alloc(8);
  len.writeBigUInt64BE(BigInt(b.length));
  return Buffer.concat([len, b]);
}
function commitmentDigest(fields, nonceHex) {
  const parts = [lp(String(fields.length))];
  for (const f of fields) { parts.push(lp(f.key)); parts.push(lp(f.value)); }
  return crypto.createHash('sha256')
    .update(Buffer.concat([...parts, Buffer.from(nonceHex, 'hex')])).digest('hex');
}

const utcMonth = () => new Date().toISOString().slice(0, 7);
function lastMonth() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

const month = process.argv[2] || process.env.ACCURACY_MONTH || lastMonth();
if (!/^\d{4}-\d{2}$/.test(month)) fail(`not a month: ${month}`);
if (month >= utcMonth()) fail(`${month} is this month or later, and an open month has no final rate`);

const outPath = path.join(ROOT, 'accuracy', `${month}.json`);
const callsPath = path.join(ROOT, 'accuracy', `${month}-calls.json`);
if (fs.existsSync(outPath)) {
  done(`${month} is already published. A published month is finished, and this script never rewrites one.`);
}

// ── EVERY FINGERPRINT THIS REPOSITORY HAS EVER ANCHORED ─────────────────────
// Read from the published leaves themselves rather than from any API, because this is the
// check that a prediction predates its result and it may not depend on the thing being checked.
const leavesDir = path.join(ROOT, 'leaves');
const anchored = new Map();   // commitment -> the day it was published in
if (fs.existsSync(leavesDir)) {
  for (const file of fs.readdirSync(leavesDir).filter(f => f.endsWith('.txt'))) {
    const day = file.replace(/\.txt$/, '');
    for (const line of fs.readFileSync(path.join(leavesDir, file), 'utf8').split('\n')) {
      const hex = line.trim();
      if (HEX64.test(hex) && !anchored.has(hex)) anchored.set(hex, day);
    }
  }
}
if (anchored.size === 0) fail('this repository has published no fingerprints, so nothing can be graded against it');

const res = await fetch(`${API}/api/v1/record/month/${month}`, { headers: { accept: 'application/json' } });
if (!res.ok) fail(`the record API answered ${res.status} for ${month}`);
const body = await res.json();
if (!body || !Array.isArray(body.reveals)) fail('the API answered without a reveal list');
if (body.month !== month) fail(`the API answered for ${body.month} when asked for ${month}`);
if (body.reveals.length === 0) done(`Nothing to publish for ${month}: no athlete shared a graded call.`);

// ── GRADE ───────────────────────────────────────────────────────────────────
const calls = [];
let within = 0, ungradeable = 0, unanchored = 0, mismatched = 0;
const athletes = new Set();

for (const r of body.reveals) {
  if (!r || !Array.isArray(r.fields) || !HEX64.test(String(r.nonce || '')) ||
      !HEX64.test(String(r.commitment || '')) || !HEX64.test(String(r.athlete || ''))) {
    mismatched++; continue;
  }
  if (commitmentDigest(r.fields, r.nonce) !== r.commitment) { mismatched++; continue; }

  const day = anchored.get(r.commitment);
  if (!day) { unanchored++; continue; }

  const field = (k) => (r.fields.find(f => f.key === k) || {}).value;
  const low = Number(field('bandLowKg'));
  const high = Number(field('bandHighKg'));
  const actual = Number(r.actual);
  if (!Number.isFinite(low) || !Number.isFinite(high) || !Number.isFinite(actual) || high < low) {
    ungradeable++; continue;
  }

  // 🔒 INCLUSIVE, AND THE BAND IS THE APP'S OWN CLAIM. Both ends count as inside: the band is
  // what Jerry said the result would fall within, and a result exactly on the stated edge is
  // the claim being met, not missed.
  const hit = actual >= low && actual <= high;
  if (hit) within++;
  athletes.add(r.athlete);
  calls.push({
    commitment: r.commitment, anchoredIn: day, fields: r.fields, nonce: r.nonce,
    actual: r.actual, within: hit,
  });
}

if (calls.length === 0) {
  done(`Nothing to publish for ${month}: no reveal could be graded ` +
       `(${unanchored} not anchored, ${mismatched} did not recompute, ${ungradeable} malformed).`);
}

const document = {
  month,
  scheme: SCHEME,
  graded: calls.length,
  within,
  // The rate, stated to four decimals so it can be reproduced exactly rather than to a rounded
  // percentage a reader cannot check.
  rate: Number((within / calls.length).toFixed(4)),
  // 🔒 NEVER OMITTED. See the header: the rate without this number reads as a crowd.
  athletes: athletes.size,
  // Stated so nobody has to ask what was thrown away and why.
  notGraded: { unanchored, didNotRecompute: mismatched, malformed: ungradeable },
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(document, null, 2) + '\n');
// The graded calls themselves, so the rate above can be recomputed by anyone, including the
// fingerprint check against this repository's own published days.
fs.writeFileSync(callsPath, JSON.stringify({ month, scheme: SCHEME, calls }, null, 2) + '\n');

console.log(`Published ${month}: ${within} of ${calls.length} inside the band ` +
            `(${(document.rate * 100).toFixed(1)}%), ${athletes.size} athlete(s).`);
