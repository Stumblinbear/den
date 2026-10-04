---
name: scoping
description: Reads the direction record and settles consequential decisions before a brief is written, one question at a time, with existing context read first and confirmed direction kept distinct from assumptions.
when_to_use: ALWAYS invoke this skill when a plan is written or revised, before the first brief of each step, when implementation exposes a conflict with the direction record, and when the user says "scope this", "grill me", or "interview me". Do not settle a choice in a plan, a brief or a workaround; use this skill first.
---

# Scoping

An ask that reads two ways gets built one way, and the wrong reading costs a
round to build and a round to undo.

## The direction record

The project's direction record holds this feature's purpose, the relevant
constraints and planned developments, and which statements remain assumptions.
Read it alongside the supplied context and the user's answers. Code
establishes current behavior; the record establishes what the project is
working toward.

What this pass establishes or corrects about that direction goes back into
the record.
Task-specific decisions stay with the task unless they also change the broader
direction.

Preserve questions deliberately left open or recorded when the user ended
discovery, and revisit them when new evidence arrives or a task decision
depends on an answer. A confirmed future capability can constrain a boundary
without authorizing its implementation.

## Decisions only

What is asked is a decision, and only one that is the user's to make. A fact
the code, the docs or the git history holds, a convention the codebase already
establishes, or a choice a written rule of the project or of these skills
already answers, is looked up and applied rather than asked: a turn spent
confirming what you could have read is a turn not spent on a decision. A step
the user specified outright, a rename to names they gave or a move they
dictated, leaves nothing to ask.

Whether a choice is already settled is what the pass finds out: the session's
sense that context settles it is the reading the pass exists to check.
Existing code, a passing regression test, a previously accepted local fix, or
an earlier plan's `Proposed:` line establishes behavior or intent, not the
user's agreement with the assumption behind it. When new evidence calls that
assumption into question, check its authority and reopen the affected
decision while independent work continues.

Which file and module code sits in, and the shape and names of private
types, belong to the implementer, so they go in the brief as intent. What the
change does and how other code uses it is the user's: which part owns a
behavior, the calls other parts make and what they do, what an operation does
on a conflict or a failure, every public name and every stored format.
Classify a choice by its consequences, never by its diff size: an
internal-looking interface or fallback that changes behavior beyond the agreed
contract is still a design decision.

## One question at a time

Before the first question, walk the ask's dimensions and list every choice
the change makes in each:

- scope and what counts as done;
- ownership: which part does what;
- data and stored formats;
- how other parts call it, and the names they read;
- failure and conflict behavior;
- lifecycle and timing.

A choice no recorded decision of the user's settles goes in the queue. Ask
missing project intent first where it changes the design, then dependencies,
highest impact and uncertainty, so each question goes where the readings
diverge most. Keep the queue to yourself: each answer rewrites it, and a
preview commits you to questions the next answer may retire.

Every question carries your recommended answer with what it buys, what it
costs, and the alternative rejected and why. When the work is a one-way
door, spend one question on a premortem, assuming it shipped and failed and
asking which failure the user fears, because the walk forward through the
decision tree cannot reach that answer.

Ask through AskUserQuestion, the recommended option first, one question per
call. A question that needs a worked example is asked in prose instead, since
the tool hides the prose written before it.

## Stopping

The pass ends at the user saying done, or when every choice on the list is
settled. Record what remains open and what depends on it. An assumption may carry
reversible work forward; an unresolved choice on a one-way door waits for
the user's answer. Ending the pass answers nothing that is still open.

## Where the answers go

Carry the record's path, the settled decisions as a list, one decision with
its reason each, and the unresolved questions into what follows; when nothing
follows, report those three as the outcome.
