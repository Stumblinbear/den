---
name: context-budget
description: Use when the session's context is filling and you need to recommend `/compact` or a rewind summarize to the user — how a rewind summarize differs from `/compact`, how to pick a cut point and a focus line, and how to judge a natural stopping point for the task in hand.
---

# Context budget

Two ways to shrink a session, differing only in where the cut falls and who
can make it:

| | kept verbatim | summarized | run by |
|---|---|---|---|
| `/compact [focus]` | a recent tail, size chosen for you | everything before it | you or the user |
| rewind, "Summarize up to here" | everything from the selected prompt on | everything before it | the user only |

`/rewind` takes no arguments and cannot be invoked by you: the direction, the
prompt, and the focus text are all chosen by the user in its interactive
picker, which lists their own prompts. Your part is the recommendation.

## Choosing between them

Plain `/compact` already preserves a recent tail, so reach for rewind only when
you can name a cut point better than "the last little while".

- **`/compact` with a focus line** — the session is one continuous thread and
  the recent work is the work. The default; it costs one command and no picker.
- **"Summarize up to here"** — a bounded stretch is finished and behind you (a
  shipped feature, an investigation that produced its answer) and the current
  task began at a prompt you can quote. Everything from that prompt on survives
  exactly, which is what makes this the safe direction mid-task.

## Naming the cut point

Look for the prompt where the work you are still doing began — usually the
first prompt of the current task, not the most recent one. A good cut point has
nothing after it that you would be sorry to lose and nothing before it that you
are still leaning on.

## The cache window

A rewind at a prompt re-reads everything before it. That prefix is cached only while the prompt is younger than the session's cache lifetime, 5 minutes or an hour: a rewind at a cached prompt costs nothing, and one at an uncached prompt re-reads its whole prefix at full price. Prefer the oldest cached prompt at or after the start of the current task; that is the most the session can summarize away for nothing. What it keeps is written back at the write price when the rewind lands — twice a fresh input token on the one-hour lifetime, 1.25 times on the five-minute — so a cut that keeps most of the context is a case for a newer cut or for `/compact`. The `cut-point` skill reads the transcript, lists the cached prompts with the time each stays cached until, and says how to phrase the recommendation; invoke it rather than guessing, and again if the time you quoted has passed.

## The focus line

A focus line steers what the summary keeps; it is optional on both `/compact`
and rewind, and it is where most of the value is. Write it as what must survive,
concretely, not as a topic:

- good: "keep the file paths touched, the failing test name, and the decision to
  use a temp-dir state file over a data-dir one"
- weak: "keep the important context about the plugin work"

Decisions and their reasons, exact identifiers, and open questions are worth
naming. Anything still on disk is not — a summary that re-describes code you
can re-read spends tokens to save none.

## Judging the stopping point

At the notice threshold, keep going and raise it where losing working state
costs nothing:

- mid-edit or mid-refactor: after the change compiles or its test passes
- an investigation: after the finding is written down somewhere durable
- a multi-step plan: at a step boundary, never inside a step
- a subagent in flight: after its report has been relayed and whatever it leads to is launched; a pause for launch approval is not a stopping point, since the report and your judgment of it are what the launch prompt is written from
- a red-then-green fix: after green

At the urgent threshold, the stopping point is the end of the step you are in.
Do not open a new file, launch a subagent, or start a step you cannot finish.

