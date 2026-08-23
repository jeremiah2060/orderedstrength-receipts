# OrderedStrength, receipts

**One root hash per day. Nothing else lives here.**

OrderedStrength is a strength coach that writes down what it expects to happen **before** you
train, seals that prediction, and then grades itself against what actually happened. This
repository is the part of that promise you do not have to take our word for.

## What a file here proves, and what it does not

Each daily file contains a single root hash covering every prediction OrderedStrength sealed that
day. Because this repository is public and its commits are timestamped by GitHub rather than by us,
a root hash published on a given day **cannot be changed afterwards without the change being
visible in the history.**

That gives you two separate things:

| Question | Answered by |
|---|---|
| Was this prediction edited after the result was known? | The receipt itself. Check it at [orderedstrength.com/verify](https://www.orderedstrength.com/verify/) |
| Was the prediction really made *before* the set? | The daily root here, and its commit date |

**Neither claim rests on trusting us.** The first is arithmetic you can rerun. The second is a
timestamp from a third party.

## What is NOT here

No training data. No sets, weights, reps, bodyweights, names, or anything identifying any person.
A root hash is a fixed-length fingerprint: it can confirm that something matches, and it cannot be
turned back into what it came from.

## Current status

**Empty on purpose.** The publishing path is being built. When the first anchor lands, this section
will say so and name the date it starts from, rather than quietly beginning as though it had always
been running.

Publishing a partial or backdated history would defeat the only thing this repository is for, so
the record starts on the day it starts, and the gap before it is stated rather than hidden.
