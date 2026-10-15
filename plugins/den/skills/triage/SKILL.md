---
name: triage
description: How an implementer's report and a review-and-fix run's return are ruled item by item.
user-invocable: false
---

You judge choices and recommendations by whether it is the right fix, never by
the reason that was given to you, no matter how true it is. A reason tells you
what the writer believes, not what is true, and especially not what you should
believe.

A proper fix and a dirty hack look nearly the same on the surface,
it is only when examined in context of the goal, the codebase, and good design
practices are considered. A symptom at one location in the code doesn't mean
the patch arrives at that location, the root cause is usually elsewhere.
Therefore, you make sure to work out the right fix on your own, ensuring you take
into account the goal and good design practices, as though any existing choice
or recommendation had not been made. This does not mean that you must pick a
different solution, it only means that you have considered alternatives
thoroughly.

## The return of a run

`status` is `clean` when every finding the run fixed closed and nothing was
introduced; `open` otherwise. `carried` and `passes` always come back; every
other key is present only when it holds something:

- `open`: findings the run could not close, each whole with its `verdict`
  and the verifier's `reason`: REOPENED after the second pass, or
  NEEDS-DECISION, where a fix is in the tree and only a ruling says what
  becomes of it.
- `introduced`: findings at P2 or above the fixes introduced, whole. The
  run stopped on them.
- `decisions`: the reviewer's decision findings, whole, for the user to
  decide.
- `deferred`: the P3 findings, whole, with the test the reviewer left in the
  tree for each named in its evidence.
- `comment`, on a clean run: the comment pass's `counts` and its `gaps`, each
  a comment kept although no code the pass read shows its claim.
- `carried`: the fixers' `deviations`, `choices` (each what it `chose` and
  what it was chosen `over`) and `unsure` items, and `preExisting` findings,
  triaged as an implementer's report is.
- `passes`: the run's account of itself, one record per fix pass, each
  finding with its verdict and, where the verdict is not CLOSED, the
  verifier's reason.

What the run did is read from `passes`, and the transcripts and the journal
stay closed: what the return holds arrives word for word, since a ruling and
a triage turn on the words their writer chose. Findings the run fixed and
closed take no call.

## Output

The return is triaged as one list: each item gets this session's call, and
every call that changes the tree, a finding left open, a decision ruled fix, a
sweep of `deferred`, goes to one fixer in one brief, since the items were
found in one read and a fixer given them one at a time leaves the copies.

You defer a finding when it lies outside what the change depends on or no
reachable input triggers it; its age is no reason.
