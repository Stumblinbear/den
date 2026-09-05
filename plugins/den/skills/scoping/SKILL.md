---
name: scoping
description: Settle the decisions an ask leaves open before a brief is written - one question at a time, each with a recommended answer, facts looked up rather than asked, and every answer written into the brief. The coordinating session runs this pass; subagents cannot ask the user.
when_to_use: Use before writing a brief, when the ask leaves a decision whose readings would produce materially different work and the repository does not settle it. Trigger phrases - "scope this", "grill me", "interview me".
---

# Scoping

An ask that reads two ways gets built one way, and the wrong reading costs a
round to build and a round to undo. This pass puts the readings that would
produce materially different work to the user as decisions, before the brief
is written.

## When the pass runs

The pass runs on work about to be briefed. When the ask leaves a decision
whose readings would produce materially different work and the repository
does not settle it, open the pass yourself and bound it to five questions --
the user came with work to do, not an interview. When you could describe the
diff in one sentence, the work goes straight to the brief. When the user asks
for the pass, it is unbounded and no ask is too small for it.

## Decisions only

What is asked is a decision, and only one that is the user's to make. A fact
the code, the docs or the git history holds, or a convention the codebase
already settles, is looked up rather than asked: a turn spent confirming what
you could have read is a turn not spent on a decision. Placement, module
boundaries, interface depth, type shape and naming belong to the implementer,
so they go in the brief as intent rather than to the user as a question. One
of them that is itself a requirement -- a user-facing name, a CLI flag, a
config key -- is a decision like any other, and is asked.

## One question at a time

Dependencies first, then highest impact and uncertainty, so the budget is
spent where the readings diverge most; branch across the ask's dimensions --
scope, data, interaction, failure behavior, integration, what counts as done
-- rather than drilling one chain to the bottom. Keep the queue to yourself:
each answer rewrites it, and a preview commits you to questions the next
answer may retire.

Every question carries your recommended answer with what it buys and what it
costs, in the form `den:design-decisions` sets. When the work is expensive to
undo, spend one question on a premortem -- assume it shipped and failed, and
ask which failure the user fears -- because the walk forward through the
decision tree cannot reach that answer.

Ask through AskUserQuestion, the recommended option first, one question per
call. A question that needs a worked example is asked in prose instead, since
the tool hides the prose written before it.

## Stopping

The pass ends at the budget, at the user saying done, or when every decision
that would change the work is settled. Everything still open is written down
as deferred with the assumption the work proceeds under, so a decision nobody
made is visible as one.

## Where the answers go

Every answer lands in the brief's "decisions already made" section, so the
brief carries them and not the conversation. When no brief follows, the reply
lists the decisions and the deferrals as the outcome of the pass.
