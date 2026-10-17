---
name: slicing
description: How a change is cut into steps a reviewer holds in one read and sequenced by risk, with the test a boundary must pass, the settled techniques for cutting what looks atomic, and the interrogation of the first attempt.
when_to_use: ALWAYS invoke this skill when planning how a change will land, before its first step starts, and whenever an observation falsifies what the plan assumed. Do not order the steps directly or take the first cut as right, however obvious it looks; use this skill first.
user-invocable: false
---

# Slicing

## The unit

A step is a change that leaves the tree building and its tests green, that
a reviewer holds in one attentive read, and that lands, reviewed and
committed, before the next starts. The read is the bound, and it is
generous: a reviewer holds several hundred lines across a few mechanisms in
one attentive sitting, and a mechanical sweep across forty files. What
exceeds it is a diff whose parts must be judged in separate sittings, a
rewrite of two subsystems at once.

## Separation and order are different rules

Order is by risk. The assumption most likely to be wrong is tested first,
inside the first step or as it; a risk is a reason to order, not a step of
its own, and a change with one step has nothing to order. A walking
skeleton, the thinnest path end to end before any breadth, is for a change
that spans layers. A one-way door, such as a stored format, a public
surface or a dependency, is decided early and landed in the latest step that
can hold it. Order never makes a boundary, whether it comes from risk or
from one piece needing another.

A change is one step until a boundary earns its place, by one of two tests:
what landing the first piece teaches changes what the second should be, or
together they exceed one read. The first test runs one way. Where the second
piece decides the shape of the first, as the callers a mechanism exists for
decide the mechanism, or a decision decides the machinery that carries it
out, the two are one step: cut apart, the first is built against a stand-in
for the second, and the second rebuilds it. Attributing a failure to one
piece is what a test does, not a boundary. Pieces that one trial tests land
together, whatever assumptions they carry. Each boundary costs a review, a
commit, whatever the project pays to make a change live, and the earlier
piece tested on input the later one would have changed; most changes pay for
none.

## Cutting what looks atomic

Once a boundary has earned its place and the pieces look inseparable, the
settled techniques, by name: parallel change (expand, migrate, contract) for
a change of interface or format; branch by abstraction for swapping an
implementation under live callers; strangler fig for replacing a subsystem;
a seam introduced before the behaviour that uses it; a red test before the
fix when the fix is the risky part. Each honours a boundary that passed a
test, and none makes one.

## The plan

One JSON file in the shape `references/plan.schema.json` defines. Read it
before writing a plan. Put the plan to the user with `den:plan-page`.

A proposal is a call the agent made. It stays a proposal whatever the user
answers, and its `status` records the answer. A decision is one the user made
themselves. An open question answered with the agent's recommendation is an
approved proposal. One answered with the user's own answer is a decision.

Leave a question to the implementer when it is better decided in the code,
as a proposal marked `leftToAgent`.

Write `over` only for an alternative that was actually weighed.

The plan is a hypothesis: after each step lands, what was learned rewrites the
next entry and each `status`. A falsified assumption re-cuts the smallest remaining
part it invalidated; a change to the goal or to a one-way door re-plans the
whole and goes to the person who decides it. Most changes are one step, and a
one-step plan is stated as one. An entry is read against the defect the step
exists to remove, since an entry that keeps the defect narrower is not a cut.

## Interrogate the first attempt

The first ordered set of cuts is written as if it were right, and it is
presumed wrong. Before it is put to the person who decides it, interrogate
each cut as they would: why is this boundary here, and what does landing the
earlier piece alone show that landing both together would not; why is this
step before that one, and what changes if the order is reversed; what does
this step cost the reviewer that merging it would save. A cut survives when
its answer names one of the two tests. A cut that survives on "it is
smaller", or on the later step needing the earlier one, is merged, and so is
a step whose entry builds something for a later step to move or rebuild. Run
the same interrogation once more over what changed. The pass is an argument
against the plan, since a re-read agrees with itself.
