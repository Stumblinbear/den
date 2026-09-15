# Implementation goes out as a brief

Status: accepted 2026-09-14. Replaces "Implementation keeps the context that
designed it" (2026-09-09), which handed coupled implementation off with its
context kept, by a fork of the lead session or a model switch, priced by the
`handoff-cost` reading, with the user choosing the route each time.

## Context

The 2026-09-09 record handed coupled implementation, the work that follows
from decisions the session made, to a route that lost nothing: a fork inherits
the whole conversation from the parent's cache, and a first request measured
that day read 104,584 tokens from cache and wrote only its instruction. A
`handoff-cost` reading priced the fork against a brief in cache-miss tokens,
and the Handoff question put the two figures to the user before every coupled
implementation, because only the user can weigh fidelity against the day's
allowance.

The fork was never taken. From the day it shipped, every implementation went
out as a brief, so by 2026-09-14 the question priced the brief against a route
nobody chose. The model switch, the third route, had gone earlier; its removal
left den's floor at the Claude Code release that turned the fork launch on.

## Decision

We will brief implementation that follows from decisions this session made to
a standing implementer, one step at a time, once the design is pinned and the
work is cut. The brief carries what the conversation settled, since the
implementer holds nothing this session does. The proposal before a launch
names the implementer and the scope, and waits for the user's go.

We will let the user choose the route for a fix round that carries a question
for them: a resume of the agent that made the change, which holds its own read
of the files, or a brief to a standing implementer, which holds neither.

We will keep the fork for one use, a quick, easy change this session would
otherwise make by hand or one the user asks for inline. That change is already
authorized, so it goes to a fork without a question, and the fork keeps the
file reads, the edit output and the test run out of this session's context.

We will keep review with fresh agents in every case, whoever wrote the change.
Huang et al., "Large Language Models Cannot Self-Correct Reasoning Yet" (ICLR
2024), is the one unambiguous result on self-review: review by the agent that
did the work catches little.

The rules themselves live in `plugins/den/skills/lead/SKILL.md`.

## Considered options

- **Keep the fork as a handoff route, documented but unpriced.** Costs
  nothing to leave in place. Leaves the lead a route it has never chosen and
  has no figure to choose it by, which is a decision pushed onto every later
  reader.
- **Keep the reading and the question.** Preserves the choice the 2026-09-09
  record wanted the user to have. Pays a skill, a script, a hook and three
  modules, and one question at every launch, to price an option with a single
  answer.
- **Remove the fork entirely.** The smallest set of routes. Puts quick edits,
  their file reads and their test output back in the lead's context, which is
  the one thing the fork was measured to save.

## Consequences

- A brief carries only what it says, and the fork carried the whole
  conversation. That loss is accepted, and the brief is written to carry what
  the conversation settled: the design basis, the decisions and their reasons,
  the scope limits and what is left open. Cemri et al., "Why Do Multi-Agent
  LLM Systems Fail?" (arXiv:2503.13657), put about a third of the failures
  they annotate under inter-agent misalignment, which is the class a summary
  handoff produces. The brief is where this arrangement is weakest.
- The `handoff-cost` skill, its script, the `handoff`, `transcript` and
  `session-record` modules and the `transcript-record` hook that fed them went
  with the question they served (step 4, 2026-09-14). Nothing in den reads the
  session's own transcript. A held-back proposal for a step watcher went with
  them: it read the fork as a route that implements a whole step, and it read
  the brief through that transcript reader, so the idea gets written afresh
  against the plan file if it is taken up again.
- The go before an implementation is a plain proposal again, the implementer
  and the scope, with no figures in it. The usage constraint that made the
  2026-09-09 record ask each time is met by the proposal naming the model, so
  the user still decides what each step spends.
