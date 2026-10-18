---
name: planning
description: The procedure that writes a task's plan, puts it to the user and keeps it current while its steps land.
user-invocable: false
---

# Planning

A plan is one JSON file per task, `.local/plans/<task>.json` in the
repository, in the shape `references/plan.schema.json` defines.

1. Once the task's goal is confirmed, create a new plan file named for the
   task, so one task's plan never mixes with another's. Read the schema before
   writing it.
2. Read the project's direction record, where it has one: it holds what the
   project is working toward, which the code cannot show. A capability the
   record plans can constrain a boundary without authorizing its
   implementation.
3. Write the problem, the goal, what done is, what is out of scope and the
   constraints, then the survey: the facts about the code the plan rests on,
   each with its evidence.
4. Settle each choice the plan makes with `den:scoping`.
5. Cut the change into steps.
6. Put the plan to the user with `den:plan-page`.
7. When a step starts, mark it `inProgress`.
8. After each step lands, rewrite the next step from what was learned and
   update each `status`.

A revision re-enters at the step it changes: a changed decision at step 4; a
falsified assumption at step 3, where the survey fact that stated it is
corrected, and at step 5, where the smallest remaining part it invalidated is
re-cut. A change to the goal or to a one-way door re-plans from step 3.
Whatever changes what the user approved goes back to them at step 6.

The plan holds what this task settled: a rule CLAUDE.md or memory already
states stays out, since every session loads it. The plan names the user in
the third person, since agents read it too.

## The unit

A step is a change that leaves the tree building and its tests green, that
a reviewer holds in one attentive read, and that lands, reviewed and
committed, before the next starts. The read is the bound, and it is
generous: a reviewer holds several hundred lines across a few mechanisms in
one attentive sitting, and a mechanical sweep across forty files. What
exceeds it is a diff whose parts must be judged in separate sittings, a
rewrite of two subsystems at once. A step is read against the defect it
exists to remove, since a step that keeps the defect narrower is not a cut.

## Separation and order are different rules

Order is by risk. The assumption most likely to be wrong is tested first,
inside the first step or as it, and a change with one step has nothing to
order. A step that resolves a risk the later steps rely on earns its boundary
by the first test below, since its answer changes what they should be. A
walking skeleton, the thinnest path end to end before any breadth, is for a
change that spans layers. A one-way door, such as a stored format, a public
surface or a dependency, is decided early and landed in the latest step that
can hold it. Order alone never makes a boundary, whether it comes from risk or
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
