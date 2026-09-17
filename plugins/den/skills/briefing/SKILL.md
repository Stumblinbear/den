---
name: briefing
description: What a brief for an implementer pins and leaves open, and how a change's steps are briefed one at a time.
when_to_use: ALWAYS invoke this skill before writing a brief for an implementer, a fixer's or a send-back's among them, and before the first step of a plan is briefed. Do not write a brief directly; use this skill first.
user-invocable: false
---

# Briefing

## Before the brief

Before task scoping, locate the relevant project goals, roadmap or direction
record and reuse answers already given. When direction needs establishing or
updating because it is missing, conflicting or superseded, invoke
`den:project-direction` in this session. Continue to scoping with its durable
record and any unresolved questions; a user-ended discovery pass is not a set
of answered questions.

Where the ask leaves a decision open, `den:scoping` settles it with the user
before the brief is written. What it clarifies about the project's direction
goes into the direction record, and exploration and the brief carry that
record's path and the decisions scoping settled, each with its reason. An
agent that reads the record itself reads the direction as it stands; a
restatement drifts from the day it is written.

A change that adds a module, a stored format, a public surface or a new
mechanism has its decomposition chosen before the brief by
`den:design-exploration`, and the brief pins the user's choice. The rest of
placement, interface depth, type shape and naming belongs to the implementer,
unless one of them is itself a requirement, and the brief says which.

## What a brief pins

A brief pins behavior, external constraints, and the decisions already made, and
states intent for everything else; wording is pinned only where the exact
wording is the deliverable, since a pin is a decision the implementer can only
question, not make. A brief is the intended shape, and the goal governs it:
its fence names what the change is not for, never a count of items or a list
of files, since an implementer that meets the goal past the items has done
the work and one that stops at the items beside a defect has not.

Every pin names its source, the user's word, an external constraint or the
code, and its reason; a pin with neither, a habit, an encoding's convenience,
a concern carried over from a different mechanism, is a question. The brief is
written from the last word on each decision, since a conversation revisits its
decisions and the earlier text is superseded. Approval of an outcome is not a
specification of it. A lean goes to the user as a recommendation with its
cost, never into the part the implementer reads as permission.

A question back from an implementer is the brief working, and the brief
changes when the implementer is right. The brief's text is written under
`den:writing-for-agents`.

Implementation has no implicit deadline. Carry time constraints into briefs
only when the user sets them. Weigh correctness, coherence and maintenance
cost when assessing the work; extra implementation effort is not an unstated
reason to accept a weaker solution. Distinguish the task's goal from
explicit scope fences so the brief leaves room for engineering judgment.
Future plans constrain choices without expanding authorized scope.

## Steps

A change lands as a sequence of steps cut under `den:slicing`. The plan is
written to a temporary directory and its steps are tracked in the task list;
the sequence is put to the user as a page through `den:plan-page` before the
first step's launch proposal, since where the cuts fall is their decision.
Each step runs the whole cycle on its own, launch, triage of the implementer's
report, a `den:review-and-fix` run with the plan's path, and commit proposal,
and the next step is briefed after the previous one has landed, on the tree as
it now is, so what its review found reaches the brief. A brief for a step
carries the plan's path and the entry for that step. A step whose diff outgrew
one read was cut wrong: it is re-cut where it grew and the part already done
is reviewed as its own step, because the user reads every step's diff, and a
diff they cannot read is a decision they cannot overturn.

The plan is cut against a read of the code, and an entry is read again before
its brief where earlier steps moved what it rests on. A cut rests on facts the
plan never states, and an implementer inherits the ones that are wrong.
