#!/usr/bin/env node
// publish-anchor.mjs — write one day's anchor into this repository.
//
// This script runs inside a GitHub Action, in this public repository, and it is deliberately
// the ONLY thing that can add a file here.
//
// ═══════════════════════════════════════════════════════════════════════════════
// IT DOES NOT TRUST THE SERVER IT READS FROM, AND THAT IS THE POINT
// ═══════════════════════════════════════════════════════════════════════════════
// The API hands back a day's root AND that day's leaf list. This script recomputes the root
// from the leaves with its own independent implementation below and REFUSES TO PUBLISH if the
// two disagree. A root published here is permanent and timestamped by GitHub; publishing one
// that does not match its own leaves would hand every future reader a file that fails the very
// check the file exists to pass, and we would have signed it ourselves.
//
// This is also the fourth implementation of the same Merkle construction (Swift, the server,
// a Python cross-check, and here). They are pinned to one golden vector. That redundancy is
// not waste: a root that disagrees with the sealer is indistinguishable from us never having
// sealed the prediction, which is the exact accusation the anchor exists to refute.
//
// ═══════════════════════════════════════════════════════════════════════════════
// THREE REFUSALS, AND EACH ONE IS A PROMISE ON THE WEBSITE
// ═══════════════════════════════════════════════════════════════════════════════
// 1. NEVER OVERWRITE. A date already present here is finished. Re-publishing a different root
//    for a date that is already public is indistinguishable from rewriting history, and it is
//    the single most damaging thing this repository could do.
// 2. NEVER PUBLISH TODAY OR THE FUTURE. A day still receiving predictions would get a
//    different root tomorrow. Only a closed day has a final answer.
// 3. NEVER BACKFILL. /record/ says it in so many words: "Backfilling would destroy the only
//    thing this is for." A run may publish the day it is given and days after the first
//    anchor; it may never reach back before the record started.

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const API = process.env.OS_ANCHOR_API || 'https://api.orderedstrength.com';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SCHEME = 'os-merkle-v1-sha256';

// ── The construction, restated independently ────────────────────────────────
//   leaf     = SHA256(0x00 || the ASCII bytes of the lowercase hex string)
//   internal = SHA256(0x01 || left || right)
//   odd node = PROMOTED unchanged, never duplicated (CVE-2012-2459)
//   input    = SORTED first, so the root does not depend on arrival order
const HEX64 = /^[0-9a-f]{64}$/;
const leafHash = (hex) =>
  crypto.createHash('sha256').update(Buffer.concat([Buffer.from([0x00]), Buffer.from(hex, 'ascii')])).digest();
const internalHash = (a, b) =>
  crypto.createHash('sha256').update(Buffer.concat([Buffer.from([0x01]), a, b])).digest();

function merkleRoot(hexes) {
  if (hexes.length === 0) return null;
  let level = [...hexes].sort().map(leafHash);
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; ) {
      if (i + 1 < level.length) { next.push(internalHash(level[i], level[i + 1])); i += 2; }
      else { next.push(level[i]); i += 1; }
    }
    level = next;
  }
  return level[0].toString('hex');
}

function fail(message) { console.error(`REFUSED: ${message}`); process.exit(1); }
function done(message) { console.log(message); process.exit(0); }

const utcToday = () => new Date().toISOString().slice(0, 10);
function yesterday() {
  return new Date(Date.now() - 86400000).toISOString().slice(0, 10);
}

const date = process.argv[2] || process.env.ANCHOR_DATE || yesterday();
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(`not a date: ${date}`);
if (date >= utcToday()) fail(`${date} is today or later, and a day still open has no final root`);

const anchorPath = path.join(ROOT, 'anchors', `${date}.json`);
const leavesPath = path.join(ROOT, 'leaves', `${date}.txt`);
if (fs.existsSync(anchorPath)) {
  done(`${date} is already published. A published day is finished, and this script never rewrites one.`);
}

// ── THE NO-BACKFILL FLOOR ───────────────────────────────────────────────────
// The record starts on the day it starts. `.anchor-start` is written by the FIRST publish and
// is the floor forever after: a run that tried to reach behind it would be manufacturing a
// history after the results were known, which is the one thing this repository must never do.
const startPath = path.join(ROOT, '.anchor-start');
if (fs.existsSync(startPath)) {
  const start = fs.readFileSync(startPath, 'utf8').trim();
  if (date < start) {
    fail(`${date} is before this record began (${start}). Backfilling would destroy the only thing this repository is for.`);
  }
}

const res = await fetch(`${API}/api/v1/anchor/day/${date}`, { headers: { accept: 'application/json' } });
if (!res.ok) fail(`the anchor API answered ${res.status} for ${date}`);
const body = await res.json();

if (body.published !== true) {
  done(`Nothing to publish for ${date}: ${body.reason || 'the day carries no predictions'}.`);
}

const doc = body.document;
const leaves = body.leaves;
if (!doc || !Array.isArray(leaves)) fail('the API answered without a document and a leaf list');
if (doc.date !== date) fail(`the API answered for ${doc.date} when asked for ${date}`);
if (doc.scheme !== SCHEME) fail(`unknown scheme ${doc.scheme}`);
if (leaves.length === 0) fail('a published day with no leaves is a contradiction');
for (const h of leaves) if (!HEX64.test(h)) fail(`a leaf is not a 64-character lowercase hex digest: ${String(h).slice(0, 80)}`);
if (new Set(leaves).size !== leaves.length) fail('the leaf list contains a duplicate');
if (doc.count !== leaves.length) fail(`the document counts ${doc.count} and the leaf list holds ${leaves.length}`);

// 🔒 THE INDEPENDENT RECOMPUTATION. Everything above checks the shape; this checks the claim.
const recomputed = merkleRoot(leaves);
if (recomputed !== doc.root) {
  fail(`the root does not match its own leaves.\n  published by the API : ${doc.root}\n  recomputed here      : ${recomputed}`);
}

fs.mkdirSync(path.dirname(anchorPath), { recursive: true });
fs.mkdirSync(path.dirname(leavesPath), { recursive: true });
// The document carries the date, the scheme, the root and the count. Nothing else, forever.
fs.writeFileSync(anchorPath, JSON.stringify({ date, scheme: SCHEME, root: doc.root, count: doc.count }, null, 2) + '\n');
fs.writeFileSync(leavesPath, [...leaves].sort().join('\n') + '\n');
if (!fs.existsSync(startPath)) fs.writeFileSync(startPath, date + '\n');

console.log(`Published ${date}: root ${doc.root}, ${doc.count} fingerprint(s).`);
