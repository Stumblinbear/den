---
name: triage
description: How an implementer's report and a review-and-fix run's return are ruled item by item, and what a commit proposal carries.
when_to_use: ALWAYS invoke this skill when an implementer or a fork reports, when a review-and-fix-workflow run returns, and before proposing a commit. Do not rule on a report's or a return's items, or propose the commit, directly; use this skill first.
user-invocable: false
---

# Triage

Each item is classed by whether a reader could take it either way, not by its
size, under the lead skill's Whose call.

## An implementer's report

A finished implementer's or fork's report is triaged like a review's: every
declared choice, question back, deviation from the brief and left-undone item
reaches the user with your accept, answer, send back or defer call and its
reason, read against the task's goal, one paragraph an item, since a choice
absorbed silently is one the user never gets to overturn. Assess a challenge
to the brief against the evidence and project goals. A departure from intent
is ruled like a declared choice. A changed pin stands only on a ground the
implementer's definition allows for departing from a pin, and any other
already implemented goes back at once, on a send-back's route, and the report
says so. Where the brief pinned a decomposition, the tree is checked against
it at triage, because the deviation that matters is the one the report did
not declare.

A fixer inside a `den:review-and-fix` run reports into the run: its
declarations arrive under `carried` in the run's return, and a send-back goes
to a standing implementer after the run returns, since the fixer cannot be
resumed.

## The return of a run

`status` is `clean` when every finding the run fixed closed and nothing was
introduced, so the comment pass ran; `open` otherwise. `carried` and
`passes` always come back; every other key is present only when it holds
something, and the ones this session acts on come first, since the host cuts
a long result at its tail:

- `open`: findings the run could not close, each whole with its `verdict`
  and the verifier's `reason`: REOPENED after the second pass, or
  NEEDS-DECISION, where a fix is in the tree and only a ruling says what
  becomes of it.
- `introduced`: findings at P2 or above the fixes introduced, whole. The
  run stopped on them.
- `decisions`: the reviewer's decision findings, whole, for the user under
  the lead skill's Whose call.
- `deferred`: the P3 and quality findings, whole, with the test the reviewer
  left in the tree for each named in its evidence. One fork sweeps them, or
  the user leaves them.
- `comment`, on a clean run: the comment pass's `counts` and its `gaps`, each
  a comment kept although no code the pass read shows its claim.
- `carried`: the fixers' `deviations`, `choices` (each what it `chose` and
  what it was chosen `over`) and `unsure` items, and `preExisting` findings,
  triaged as an implementer's report is.
- `passes`: the run's account of itself, one record per fix pass, each
  finding with its verdict and, where the verdict is not CLOSED, the
  verifier's reason. What a fixer verified stays in the journal.

What the run did is read from `passes`, and the transcripts and the journal
stay closed: what the return holds arrives word for word, since a ruling and
a triage turn on the words their writer chose. Findings the run fixed and
closed take no call.

## Ruling on the return

The return is triaged as one list: each item gets this session's call, and
every call that changes the tree, a finding left open, a decision ruled fix, a
sweep of `deferred`, goes to one standing implementer or one fork in one
brief, since the items were found in one read and a fixer given them one at a
time leaves the copies. A tree changed that way is reviewed again by a fresh
run. A finding the fixes introduced is read for the mechanism before any
fixer is briefed, since it is a problem the run made. Neither missing intent nor an
undocumented rationale is automatically a defect; equally, prior approval does
not exempt a choice from contradictory evidence.

A brief for a finding carries the reviewer's repair only once this session has
traced it against the finding's discriminating check, since the repair is a
sketch. Route a bug, a finding, a repair or a declared choice at its root
cause, found by asking why one or two levels above the report: what made this
the natural mistake, and what else that answer touches. An agent's diagnosis
and remedy are the report, not the cause. A fix at the cause replaces a patch
at the symptom, because each patch is a condition the next reader carries, and
where the same expression is written by hand at several sites the fix is the
one place that makes the mistake unwritable, not the sites corrected; two
findings with one mechanism are one fix. A cause in the design reaches the
user as a design question with its rough scope.

Findings that are the user's call reach them, each with this session's fix or
skip call and its reason, read against the task's goal, one paragraph a
finding, since the user reads the triage once. A finding ruled skip, from
whichever list, goes into the next run's `rulings` with its reason where the
user ruled it, or `leadCalls` where this session did, and the fixer this
session launches takes its test out of the tree, since a run with no record
of the ruling finds and fixes what was chosen to leave.

This session defers a finding on its own only when it lies outside what the
change depends on or no reachable input triggers it; its age is no reason,
and a defect in code the change depends on is fixed, or is the user's to defer
when it predates the change. Its own deferrals are reported in a list apart
from the calls that accept, each with that reason, so the user can overturn
one without reading it as settled, and go into a task, never into `rulings` or
`leadCalls`: a deferral written there tells every later reviewer not to raise
the finding, and a fresh review is the next chance to catch one that was
wrong. A deferral the user rules is a skip.

## The commit proposal

The proposal follows this session's own run of the project's tests and
checks, since a fixer's pass count is a claim. It lists the return's
`comment.gaps`, since each is a comment that stands on a claim no code the
pass read shows, and the user decides whether such a claim is committed. A
test the reviewer left in the tree is still red for every finding not fixed,
under `deferred` or ruled skip, so the proposal lists those findings and their
tests, and puts to the user whether each test is committed, taken out by a
send-back or left for the next step, since a test removed is theirs.
