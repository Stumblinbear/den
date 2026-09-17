---
name: scoping
description: Reads the direction record and settles consequential decisions before a brief is written, one question at a time, with existing context read first and confirmed direction kept distinct from assumptions.
when_to_use: ALWAYS invoke this skill before writing a brief with an unresolved consequential decision, when implementation exposes a conflict with the direction record, and when the user says "scope this", "grill me", or "interview me". Do not settle the missing decision in a brief or workaround; use this skill first.
---

# Scoping

An ask that reads two ways gets built one way, and the wrong reading costs a
round to build and a round to undo. This pass connects the task to the project's
direction and puts readings that would produce materially different work to
the user as decisions, before the brief is written.

## The direction record

The project's direction record holds this feature's purpose, the relevant
constraints and planned developments, and which statements remain assumptions.
Read it alongside the supplied context and the user's answers. Code
establishes current behavior; the record establishes what the project is
working toward.

What this pass establishes or corrects about that direction goes back into
the record through `den:direction-docs`, since exploration and the brief carry
the record's path and the explorers and the implementer read it there.
Task-specific decisions stay with the task unless they also change the broader
direction.

Invoke `den:project-direction` when establishing or reconsidering the
broader direction is necessary; that discovery has no time or question budget
and is not part of this pass. Preserve questions deliberately left open or
recorded when the user ended discovery, and revisit them when new evidence
arrives or a task decision depends on an answer. A confirmed future capability
can constrain a boundary without authorizing its implementation.

## When the pass runs

The pass runs before a brief and reopens when implementation exposes a conflict
with the direction record. When a decision would produce materially different
work and the available direction does not settle it, open the pass yourself and
keep it to the questions whose answers change what gets built. The user came
with work to do, not an interview. When existing context settles the
consequential choices, carry the record's path straight to the brief without
new questions. Diff size does not settle whether a choice is expensive to
reverse. When the user asks for the pass, it is unbounded and no ask is too
small for it.

Existing code, a passing regression test, or a previously accepted local fix
establishes behavior, not agreement with the assumption behind it. When new
evidence calls that assumption into question, check its authority and reopen
the affected decision while independent work continues.

## Decisions only

What is asked is a decision, and only one that is the user's to make. A fact
the code, the docs or the git history holds, a convention the codebase already
establishes, or a choice a written rule of the project or of these skills
already answers, is looked up and applied rather than asked: a turn spent
confirming what you could have read is a turn not spent on a decision.
Placement, module boundaries, interface depth, type shape and naming left open
after design exploration belong to the implementer, so they go in the brief as
intent rather than to the user as a question. One of them that is itself a
requirement (a user-facing name, a CLI flag, a config key) is a decision like
any other, and is asked. Classify a choice by its consequences: an
internal-looking interface or fallback that changes behavior beyond the agreed
contract is still a design decision, even when the code change is small.

## One question at a time

Missing project intent first where it changes the design, then dependencies,
highest impact and uncertainty, so each question goes where the readings
diverge most; branch across the ask's dimensions
(scope, data, interaction, failure behavior, integration, what counts as
done) rather than drilling one chain to the bottom. Keep the queue to
yourself: each answer rewrites it, and a preview commits you to questions the
next answer may retire.

Every question carries your recommended answer with what it buys and what it
costs, in the form `den:design-decisions` sets. When the work is a one-way
door, spend one question on a premortem, assuming it shipped and failed and
asking which failure the user fears, because the walk forward through the
decision tree cannot reach that answer.

Ask through AskUserQuestion, the recommended option first, one question per
call. A question that needs a worked example is asked in prose instead, since
the tool hides the prose written before it.

## Stopping

The pass ends at the user saying done, or when every consequential decision is
settled. Record what remains open and what depends on it. An assumption may carry
reversible work forward; an unresolved choice on a one-way door waits for
the user's answer. Ending the pass answers nothing that is
still open. Independent work can continue.

## Where the answers go

Carry into exploration and the implementation brief the record's path, the
settled decisions as a list, one decision with its reason each, and the
unresolved questions. The path rather than a restatement, so that what the
explorers and the implementer read is the record as it stands. When no brief
follows, report those three as the outcome. Reading the record does not
require `den:direction-docs`.
