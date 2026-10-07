---
name: briefing
description: What a brief for an implementer carries and leaves open, and how a change's steps are briefed one at a time.
when_to_use: ALWAYS invoke this skill before writing a brief for an implementer, a fixer's or a send-back's among them, and before the first step of a plan is briefed. Do not write a brief directly; use this skill first.
user-invocable: false
---

# Briefing

## Before the brief

The brief follows a `den:scoping` pass and carries the direction record's
path, the decisions the user settled, each with its reason, and the
questions the user chose to leave open. An agent that reads the record itself
reads the direction as it stands; a restatement drifts from the day it is
written.

A change that adds a module, a stored format, a public surface or a new
mechanism has its decomposition put to the user before the brief, since the
surface is theirs to choose, and the brief carries their choice.

## What a brief carries

A brief carries the goal, the decisions the user made in their words with
the reason they gave and when, the facts the code cannot show with their
sources, and the questions still open. The implementer, in the code, decides
the rest better than a brief written from above it, and reads each decision
by its reason, so a decision written without one is one it cannot weigh. A
shape the user sketched, a map, a thread, a type, is written as their sketch,
however firmly it was said, since they decide what the system does and
cannot see every shape that doing it takes. This session's own calls go in
as questions or as facts with their source, never as instructions, since an
instruction of this session's reads as the user's and ends the judgment it
was meant to inform. The brief says what the change is not for, never a
count of items or a list of files, since an implementer that meets the goal
past the items has done the work and one that stops at the items beside a
defect has not.

The brief is written from the last word on each decision, since a conversation
revisits its decisions and the earlier text is superseded. Approval of an
outcome is not a specification of it, and a go on a plan decides none of its
`Proposed:` lines. A lean goes to the user as a recommendation with its cost,
never into the part the implementer reads as permission.

A question back from an implementer is the brief working, and the brief
changes when the implementer is right. Carry time constraints into briefs
only when the user sets them.

## Steps

A change lands as a sequence of steps. The plan is
written to a temporary directory and its steps are tracked in the task list;
the sequence is put to the user before the first step's launch proposal, since where the cuts fall is their decision.
Each step runs the whole cycle on its own, launch, triage of the implementer's
report, a review with the plan's path, and commit proposal,
and the next step is briefed after the previous one has landed, on the tree as
it now is, so what its review found reaches the brief. A brief for a step
carries the plan's path and the entry for that step, whose `Decided:` lines
are the user's decisions with their reasons and whose `Sketched:` and
`Proposed:` lines are sketches, the user's and this session's, open to what
the implementer finds. The brief
serves that step alone, since a mechanism built ahead for a later step is
designed before the later step is scoped, without the person who decides it,
and the later step rebuilds it. Where a later step's needs would shape what
this one builds, the two are one step, as `den:slicing` has it. A step whose
diff outgrew one read was cut wrong: it is re-cut where it grew and the part
already done is reviewed as its own step, because the user reads every step's
diff, and a diff they cannot read is a decision they cannot overturn.

The plan is cut against a read of the code, and an entry is read again before
its brief where earlier steps moved what it rests on. A cut rests on facts the
plan never states, and an implementer inherits the ones that are wrong.
