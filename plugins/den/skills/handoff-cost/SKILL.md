---
name: handoff-cost
description: A reading of the current context for handing coupled implementation off, pricing a fork of this session and a brief to a standing implementer as cache-miss token counts, and the question that puts the choice to the user.
when_to_use: ALWAYS invoke this skill when implementation is about to start under the lead rules and the design is pinned, before proposing a launch or a fork. Do not quote a context size or choose the handoff yourself; use this skill first.
user-invocable: false
allowed-tools: AskUserQuestion
---

# Handing implementation off

The design is pinned and the context that pinned it is the one worth keeping. Two ways to carry it, priced on the context as it stands now:

!`node "${CLAUDE_PLUGIN_ROOT}/lib/shared/launch.mjs" --data "${CLAUDE_PLUGIN_DATA}" scripts/handoff-cost --session "${CLAUDE_SESSION_ID}"`

## Asking

Before the question, every choice the brief makes that is the user's call (a stored format, a public surface, a dependency, a grammar or convention, visible behaviour, a test removed) has their word on it, and every pin names its source. One that does not is put to them in this message instead, since a launch on a brief that decided it is the decision made out of sight.

Put the two to the user with AskUserQuestion, one question, header `Handoff`, `multiSelect` false, the options labelled exactly `Fork` and `Brief an implementer`, in that order. Each description carries that row's figure from the reading and one clause of what it keeps: a fork keeps this context and this model, and works out of view; a brief carries none of it. The labels are the ones the reading's rows carry, so they are not reworded.

The reading is the facts and the choice is the user's: no option is marked recommended, none is ranked, and no description is worded to steer. The user weighs the figures against an allowance this session cannot see.

## Acting on the answer

- `Fork`: launch a fork (`subagent_type: "fork"`, in the background) with the instruction and nothing more, since it holds everything this session holds: the pinned design, its reasons and the scope fence are already in its context, and a re-typed brief would be the lossy handoff the fork exists to avoid. The instruction says one more thing, because the fork reads the same harness prompt as this session and that prompt says to finish the task: for the fork, a decision that is the user's (a workaround, a test weakened or deleted, a stored format, a public surface, a dependency, behaviour the user can see, a fence in the way, a pin the code contradicts) ends the fork's turn with only the question, and it is resumed with the answer; a task finished on such a decision is a failure however green. Ask it to report routine choices, questions it stopped on and anything left undone, so its report is triaged as an implementer's, and to invoke `den:code-architecture` before its first edit, since a fork inherits a context in which the skill may be many turns old.
- `Brief an implementer`: the lead rules' brief path, unchanged.
