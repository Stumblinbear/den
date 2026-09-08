---
name: scoping
description: Establishes the task's design basis and settles consequential decisions before a brief is written, one question at a time, with existing context read first and confirmed direction kept distinct from assumptions.
when_to_use: ALWAYS invoke this skill before writing a brief with an unresolved consequential decision, when implementation exposes a conflict with the design basis, and when the user says "scope this", "grill me", or "interview me". Do not settle the missing decision in a brief or workaround; use this skill first.
---

# Scoping

An ask that reads two ways gets built one way, and the wrong reading costs a
round to build and a round to undo. This pass connects the task to the project's
direction and puts readings that would produce materially different work to
the user as decisions, before the brief is written.

## Design basis

Derive a compact design basis from the project-direction record, supplied
context and the user's answers: this feature's purpose, relevant constraints
and planned developments, and which statements remain assumptions. Name the
source of each consequential statement. Code establishes current behavior;
the user's direction establishes
what the project is working toward. Keep inferred architectural implications
distinct from requirements and settled design decisions.

Read available goals, roadmap or design documents and reuse answers already
given. Invoke `den:project-direction` when establishing or reconsidering the broader
direction is necessary; that discovery has no time or question budget and does
not consume this pass's task questions. Preserve questions deliberately left
open or recorded when the user ended discovery, and revisit them when new
evidence arrives or a task decision depends on an answer. A confirmed future
capability can constrain a boundary without authorizing its implementation.

## When the pass runs

The pass runs before a brief and reopens when implementation exposes a conflict
with its design basis. When a decision would produce materially different work
and the available direction does not settle it, open the pass yourself and bound it to five questions --
the user came with work to do, not an interview. When existing context settles
the consequential choices, carry the basis straight to the brief without new
questions. Diff size does not settle whether a choice is expensive to reverse.
When the user asks for the pass, it is unbounded and no ask is too small for it.

Existing code, a passing regression test, or a previously accepted local fix
establishes behavior, not agreement with the assumption behind it. When new
evidence calls that assumption into question, check its authority and reopen
the affected decision while independent work continues.

## Decisions only

What is asked is a decision, and only one that is the user's to make. A fact
the code, the docs or the git history holds, or a convention the codebase
already establishes, is looked up rather than asked: a turn spent confirming what
you could have read is a turn not spent on a decision. Placement, module
boundaries, interface depth, type shape and naming left open after design
exploration belong to the implementer, so they go in the brief as intent rather
than to the user as a question. One of them that is itself a requirement (a
user-facing name, a CLI flag, a config key) is a decision like any other, and is
asked. Classify a choice by its consequences: an internal-looking interface or
fallback that changes behavior beyond the agreed contract is still a design
decision, even when the code change is small.

## One question at a time

Missing project intent first where it changes the design, then dependencies,
highest impact and uncertainty, so the budget is spent where the readings
diverge most; branch across the ask's dimensions
(scope, data, interaction, failure behavior, integration, what counts as
done) rather than drilling one chain to the bottom. Keep the queue to
yourself: each answer rewrites it, and a preview commits you to questions the
next answer may retire.

Every question carries your recommended answer with what it buys and what it
costs, in the form `den:design-decisions` sets. When the work is expensive to
undo, spend one question on a premortem, assuming it shipped and failed and
asking which failure the user fears, because the walk forward through the
decision tree cannot reach that answer.

Ask through AskUserQuestion, the recommended option first, one question per
call. A question that needs a worked example is asked in prose instead, since
the tool hides the prose written before it.

## Stopping

The pass ends at the budget, at the user saying done, or when every consequential
decision is settled. Record what remains open and what depends on it. An
assumption may carry reversible work forward; an unresolved choice that would
change an expensive commitment waits for the user's answer. Reaching the
question budget does not answer it. Independent work can continue.

## Where the answers go

Carry the design basis, settled decisions and unresolved questions separately
into exploration and the implementation brief, preserving reasons and sources.
The basis explains what a design must serve; the decisions record choices
already made. When no brief follows, report those three as the outcome.

When an agreed clarification establishes or changes project direction, use
`den:direction-docs` to update the durable record. Keep task-specific decisions
in the brief unless they also change that broader direction. Reading direction
for the design basis does not require the documentation skill.
