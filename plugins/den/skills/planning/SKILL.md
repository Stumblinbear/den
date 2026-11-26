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
   record plans for can decide where a boundary goes, and is still not built
   until a task asks for it.
3. Write the problem, the goal, what done is, what is out of scope and the
   constraints, then the survey: the facts about the code the plan rests on,
   each with its evidence.
4. Settle each choice the plan makes with `den:scoping`.
5. Cut the change into steps, and give each step the steps it comes after.
6. Put the plan to the user with `den:plan-page`.
7. When a step starts, mark it `inProgress`.
8. After each step lands, rewrite the steps that come after it from what was
   learned and update each `status`.

A revision goes back to the item above that it changes: a changed decision
to 4; a falsified assumption to 3, where the survey fact that stated it is
corrected, and to 5, where the remaining steps it invalidated are cut again,
no more of them than it reaches. A change to the goal or to a one-way door
re-plans from 3. Whatever changes what the user approved goes back to them
at 6.

The plan holds what this task settled: a rule CLAUDE.md or memory already
states stays out, since every session loads it. The plan names the user in
the third person, since agents read it too.

## The unit

A step is a change that leaves the tree building and its tests green, that
a reviewer holds in one attentive read, and that lands, reviewed and
committed, before any step that comes after it starts. The read is the
bound, and it is generous: a reviewer holds several hundred lines across a
few mechanisms in one attentive sitting, and a mechanical sweep across forty
files. What exceeds it is a diff whose parts must be judged in separate
sittings, a rewrite of two subsystems at once. Each step removes the defect
it exists for: a step that leaves the defect in place, only in fewer places,
is not a cut.

## Separation and order are different rules

Order is by risk. The assumption most likely to be wrong is tested first,
inside the first step or as it, and a change with one step has nothing to
order. The steps that rely on a risky step come after it, since its answer
changes what they should be, which is the first test below. A walking
skeleton, the thinnest path end to end before any breadth, is for a change
that spans layers. A one-way door, such as a stored format, a public surface
or a dependency, is decided early and landed in the latest step that can
hold it. Order never makes a boundary: risk, or one piece needing another,
only decides which of two pieces already separated goes first.

A step comes after another only when it needs it: the earlier step teaches
it, or it builds on the earlier step's code. Steps that come after none of
each other run in parallel. Pieces that need nothing from each other, where
each is a reviewable piece on its own, are separate steps, so they go in
parallel.

A piece that needs another stays in one step with it until a boundary earns
its place, by one of two tests: what landing the earlier piece teaches
changes what the later one should be, or together they exceed one read.
Where it is the other way round, the later piece deciding the shape of the
earlier one, as the callers a mechanism exists for decide the mechanism, or
a decision decides the machinery that carries it out, the two are one step:
cut apart, the earlier one is built against a stand-in for the later one,
and the later one rebuilds it. Telling which piece caused a failure is a
test's job, and no reason for a boundary. Pieces the user judges in one
trial land in one step, whatever assumptions each carries. Each boundary
costs a review, a commit, whatever the project pays to make a change live,
and the earlier piece tested on input the later one would have changed;
most changes pay for none.

## Cutting what looks atomic

Once a boundary has earned its place and the pieces look inseparable, the
settled techniques, by name: parallel change (expand, migrate, contract) for
a change of interface or format; branch by abstraction for swapping an
implementation under live callers; strangler fig for replacing a subsystem;
a seam introduced before the behavior that uses it; a red test before the
fix when the fix is the risky part. Each carries out a boundary a test has
already earned, and none is a reason for one.

## Interrogate the first attempt

The first set of cuts is written as if it were right, and it is presumed
wrong. Before it is put to the person who decides it, interrogate each cut
as they would: why is this boundary here, and what does landing the earlier
piece alone show that landing both together would not; why does this step
come after that one, and what changes if it does not; why do these two
steps not run in parallel; what does this step cost the reviewer that
merging it would save. A cut survives when its answer names one of the two
tests, or when its pieces need nothing from each other. A cut that survives
on "it is smaller", or on the later step needing the earlier one, is
merged, and so is a step whose entry builds something for a later step to
move or rebuild. Run the same interrogation once more over what changed,
arguing against the plan: a re-read that only checks the plan agrees with
what it already says.
