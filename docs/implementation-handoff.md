# Implementation keeps the context that designed it

Status: accepted, 2026-09-09.

## Context

den's coordinator scoped, designed and briefed in the main session, then
delegated every implementation to a standing implementer that started from
the brief alone. The brief was the only channel between the context that made
the decisions and the agent that carried them out.

The published evidence on multi-agent coding says that channel is where the
work is lost:

- Cemri et al., "Why Do Multi-Agent LLM Systems Fail?" (arXiv:2503.13657)
  annotate 1,600+ traces across seven systems and put about a third of all
  failures under inter-agent misalignment, the class a summary handoff
  produces.
- Anthropic's account of its multi-agent research system reports the gain
  from a lead plus workers on independent reads, and scopes it away from
  work where agents must share context or carry dependencies between them;
  most coding tasks, it says, have few truly parallel parts.
- Cognition's "Don't Build Multi-Agents" argues the same from production:
  share full traces, not summaries, because actions carry implicit decisions.
- Huang et al., "Large Language Models Cannot Self-Correct Reasoning Yet"
  (ICLR 2024), is the one unambiguous result the other way: review by the
  agent that did the work catches little, so review stays with fresh agents.

Claude Code offers two ways to carry a context into implementation without a
summary. A fork inherits the whole conversation on the parent's model; a
first request measured on 2026-09-09 read 104,584 tokens from the parent's
cache and wrote only its instruction. A `/model` switch keeps the
conversation and re-reads it once, uncached, on the new model. Nothing lets
the session switch its own model, so a switch is always the user's keystroke.

The user's constraint is usage: the strongest model implementing every task
exhausts a day's allowance in an afternoon. Only the user can weigh that
against what a handoff loses.

## Decision

We will hand implementation that follows from the session's own decisions off
with its context kept, and let the user choose how. Before coupled
implementation starts, the session prices the current context for a fork, a
model switch and a brief, in cache-miss tokens, and asks. A fork runs the
implementation on the same model out of view; a switch runs it in the session
on the model the user picks; a brief goes to a standing implementer as before.

We will keep the brief for work that is independent of the session's context:
parallel units such as a sweep across files, and tasks a fresh agent can do
from the brief alone. That is where delegation measured well.

We will keep review with fresh agents in every case.

## Considered options

- **Coordinator delegates all implementation** (the previous arrangement).
  Keeps the main context clean and the cost predictable. Loses whatever the
  conversation settled and the brief did not say, which the evidence above
  measures as the main failure class.
- **Main session implements everything itself.** Lossless and the simplest
  flow, and what Claude Code's own guidance describes. Fills the main context
  with implementation output, and on the strongest model breaks the usage
  constraint.
- **Fork only.** Lossless, keeps the main context clean, cached at spawn.
  Runs on the parent model, so it addresses context pollution and leaves the
  usage constraint where it was.
- **Switch only.** Lossless and cheaper per turn. Pays one uncached read of
  the whole context, fills the main context with implementation, and needs
  the user's keystroke.

None of the last three dominates: which is right depends on the context's
size and the user's allowance that day, so the decision is put to the user
each time with the figures in front of them.

## Consequences

- A `handoff-cost` skill, a transcript record written by a prompt hook, and a
  `PostModelSwitch` hook that reads the standing answer off the transcript
  now ship with den. The hooks read the session's own transcript tail, which
  den's hooks did not do before.
- The switch path is two user actions, the answer and the `/model` command,
  since no hook or tool can switch the model. The hook exists so that the
  switch is unambiguously the user starting the task: a switch made with the
  answer standing is that intent and nothing else, where a typed "go" after
  a switch could be read either way. What invoked the switch does not
  matter; the hook reads the switch event, not the command, since the
  command's transcript entry is written after the event fires. Answering and
  then typing anything else overtakes the answer, and the switch is then
  silent.
- The reading prices context reads only. Output tokens dominate an
  implementation's cost and are unknown before it runs, and the reading says
  so.
- Small fixes and edits go to a fork too, with a short instruction and no
  reading: at 104,584 tokens read from cache and 1,948 written, a spawn costs
  nothing over doing them in the session, and the context stays clean.
- The main context is no longer clean by construction. A switch fills it with
  implementation; a fork does not. Context-size guidance stays the user's.
- The coordinator's delegation default in `skills/coordination/SKILL.md` is
  rewritten; the README's first line no longer says the main session
  delegates all production work.
- No controlled study compares these three paths for coding agents under an
  equal token budget. The choice is put to the user because the evidence
  ranks the brief last and does not rank the other two.
