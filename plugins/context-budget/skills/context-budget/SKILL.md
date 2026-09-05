---
name: context-budget
description: Use when the session's context is filling and you need to recommend `/compact` or a rewind summarize to the user. It covers how a rewind summarize differs from `/compact`, how to pick a cut point and a focus line, and how to tell the end of an arc from a step inside one.
when_to_use: Use the moment a "Context budget:" notice appears in the conversation, before deciding what to recommend, and when the user asks whether to compact, rewind, or keep going. Trigger phrases - "context budget", "should I compact", "rewind or compact".
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

- **`/compact` with a focus line.** The session is one continuous thread and
  the recent work is the work. The default; it costs one command and no picker.
- **"Summarize up to here".** A bounded stretch is finished and behind you (a
  shipped feature, an investigation that produced its answer) and the arc you
  are in began at a prompt you can quote. Everything from that prompt on
  survives exactly, which is what makes this the safe direction inside an arc.

## Naming the cut point

Look for the prompt where the work you are still doing began, usually the
first prompt of the arc you are in and not the most recent one. A good cut point
has nothing after it that you would be sorry to lose and nothing before it that
you are still leaning on.

## The cache window

A rewind at a prompt re-reads everything before it. That prefix is cached only while the prompt is younger than the session's cache lifetime, 5 minutes or an hour: a rewind at a cached prompt costs nothing, and one at an uncached prompt re-reads its whole prefix at full price. Prefer the oldest cached prompt at or after the start of the arc; that is the most the session can summarize away for nothing. What it keeps is written back at the write price when the rewind lands, twice a fresh input token on the one-hour lifetime and 1.25 times on the five-minute, so a cut that keeps most of the context is a case for a newer cut or for `/compact`. The `cut-point` skill reads the transcript, lists the cached prompts with the time each stays cached until, and says how to phrase the recommendation; invoke it rather than guessing, and again if the time you quoted has passed.

## The focus line

A focus line steers what the summary keeps; it is optional on both `/compact`
and rewind, and it is where most of the value is. Write it as what must survive,
concretely, not as a topic:

- good: "keep the file paths touched, the failing test name, and the decision to
  use a temp-dir state file over a data-dir one"
- weak: "keep the important context about the plugin work"

Decisions and their reasons, exact identifiers, and open questions are worth
naming. Anything still on disk is not: a summary that re-describes code you
can re-read spends tokens to save none.

## Judging the stopping point

At the notice threshold, keep working and raise the choice at the end of the
arc you are in. The test is whether the work ahead would need the detail behind
it: at the end of an arc it would not, so a summary that keeps what came before
in outline costs nothing. A step inside an arc (a brief written, an agent
launched, a report relayed, a change made) fails that test, because the next
step is written from exactly the detail the summary would thin.

That puts the end of an arc a good deal higher than the end of a step:

- a change landed and reviewed, not a change that compiles
- a question answered and acted on, not an answer relayed
- an investigation whose finding is written down somewhere durable, so what the
  context holds is now on disk

At the urgent threshold the arc is no longer affordable to wait for: the
stopping point is the end of the step in hand. Do not open a new file, launch a
subagent, or start a step you cannot finish.

