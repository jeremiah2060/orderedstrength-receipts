# OrderedStrength, receipts

**One root hash per day. Nothing else lives here.**

OrderedStrength is a strength coach that writes down what it expects to happen **before** you
train, seals that prediction, and then grades itself against what actually happened. This
repository is the part of that promise you do not have to take our word for.

## What a file here proves, and what it does not

Each daily file contains a single root hash covering every fingerprint this record received on
that day. Because this repository is public, a root published for a given day is a public commit:
the job that writes it refuses to touch a date that already holds a file, so a root that changed
would be a visible change to this repository's history rather than a quiet edit.

That gives you two separate things:

| Question | Answered by |
|---|---|
| Was this prediction edited after the result was known? | The receipt itself. Check it at [orderedstrength.com/verify](https://www.orderedstrength.com/verify/) |
| Was the prediction already public before anyone could know the answer? | The daily root here, and GitHub's record of when it was pushed |

**Neither claim rests on trusting us.** The first is arithmetic you can rerun. The second is a
timestamp from a third party.

**And the second one dates a prediction to the day, not to the hour.** A day closes at midnight
UTC and its root is pushed in the small hours after it, so a prediction and the set it was made
for fall inside the same published day. That rules out a prediction invented after the result and
slipped into a day that is already public. It does not, on its own, order the seal against the
set. Both halves are here because only the first one flatters us.

## What `count` means, exactly

`count` is the number of fingerprints in that day's tree. It is **not** the number of predictions
made that day, and the difference is not an edge case.

A phone keeps re-sending a fingerprint until it has seen it published, which is what lets our
server hold the open day in memory with no database: a restart costs a retry rather than a lost
proof. A day closes at midnight UTC and publishes an hour or so later, so anything sealed the day
before and re-sent inside that gap lands in the new day's tree as well. On the first two days of
this record, every one of the 21 fingerprints published for 2026-09-05 also appears in the 57
published for 2026-09-06. Two published days, 57 distinct fingerprints, not 78.

Nothing is double-counted in any claim we make, because we make no claim from these totals. They
say what they say: how many fingerprints are in that tree.

## What is NOT here

No training data. No sets, weights, reps, bodyweights, names, or anything identifying any person.
A root hash is a fixed-length fingerprint: it can confirm that something matches, and it cannot be
turned back into what it came from.

## Current status

**Running.** The record starts on the date in `.anchor-start` and has published a root for every
closed day that carried anything since. Read `anchors/` for the current state rather than this
paragraph: a status line maintained by hand is a status line that goes stale, and the folder
cannot.

The publishing path is a scheduled job in this repository. It reads one closed day from our
server, recomputes that day's root from its own fingerprint list with its own independent
implementation, and refuses to publish if the two disagree. It also refuses to rewrite a day it
has already published, to publish a day that is still open, and to reach back before
`.anchor-start`. It runs here rather than on our server on purpose: a write token on our server
would mean anyone who compromised it could rewrite this record, and the third-party timestamp
would then be worth no more than our own word.

## What you will find here

| Path | What it holds |
|---|---|
| `anchors/YYYY-MM-DD.json` | That day's root hash, the scheme, and how many fingerprints it covers. |
| `leaves/YYYY-MM-DD.txt` | Every fingerprint in that day's tree, one per line, sorted. |
| `.anchor-start` | The first day this record covers. Nothing before it will ever be published. |

## Rebuilding a root yourself

The leaf list is here so that you do not have to trust us or our server for any part of the check.
These four rules turn `leaves/YYYY-MM-DD.txt` back into the root in `anchors/YYYY-MM-DD.json`, and
nothing else is needed. The scheme is named in every anchor file as `os-merkle-v1-sha256`.

1. **Sort the fingerprints** as text, so the root does not depend on the order they arrived in.
2. **A leaf** is `SHA256(0x00 || the ascii bytes of that lowercase 64 character hex string)`. The
   text of the fingerprint, not the bytes it decodes to.
3. **A parent** is `SHA256(0x01 || left || right)`. The two different leading bytes are what stop
   a leaf being passed off as a parent.
4. **An odd node moves up unchanged.** It is never duplicated to make a pair.

Repeat 3 and 4 until one node is left. That node is the root.

Rule 4 is the one worth reading twice. Duplicating a lone node is the common convention and it is
the one that lets two different lists produce the same root, so this record does not use it. If
you assume it, you will get a different number and conclude we lied: on `2026-09-05`, duplicating
gives `20f00e4a...` where this repository publishes `480aeaaa...`.

The same four rules are published at
[orderedstrength.com/spec](https://www.orderedstrength.com/spec/), and the verifier at
[orderedstrength.com/verify](https://www.orderedstrength.com/verify/) will do the walk in your own
browser for a receipt you paste.

Publishing a partial or backdated history would defeat the only thing this repository is for, so
the record starts on the day it starts, and the gap before it is stated rather than hidden.
