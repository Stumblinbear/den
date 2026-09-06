---
name: context-budget
description: How a session's context is shrunk, covering what `/compact` and a rewind summarize each keep, how to name a cut point and write a focus line, and how to tell the end of an arc from a step inside one.
when_to_use: ALWAYS invoke this skill when a "Context budget:" notice appears, before deciding what to recommend, and when the user asks whether to compact, rewind, or keep going. Do not recommend a compact or a rewind directly; use this skill first.
user-invocable: false
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
you can name a cut point better than "the last little while". The `cut-point`
skill's reading prices all three ways forward on one set of figures: `/compact`,
each cut point still cached, and carrying on unchanged.

- **`/compact` with a focus line.** The session is one continuous thread and
  the recent work is the work. The default; it costs one command and no picker.
- **"Summarize up to here".** A bounded stretch is finished and behind you (a
  shipped feature, an investigation that produced its answer) and the arc you
  are in began at a prompt you can quote. Everything from that prompt on
  survives exactly, which is what makes this the safe direction inside an arc.
  Selecting that prompt needs the interactive picker, which a user on Remote
  Control cannot open, so `/compact` with a focus line is the only cut there.

## Naming the cut point

Look for the prompt where the work you are still doing began, usually the
first prompt of the arc you are in and not the most recent one. A good cut point
has nothing after it that you would be sorry to lose and nothing before it that
you are still leaning on.

## The cache window

A rewind at a prompt re-reads everything before it. That prefix is cached only while the prompt is younger than the session's cache lifetime, 5 minutes or an hour: a rewind at a cached prompt costs nothing, and one at an uncached prompt re-reads its whole prefix at full price. Prefer the oldest cached prompt at or after the start of the arc; that is the most the session can summarize away for nothing. What it keeps is written back at the write price when the rewind lands, twice a fresh input token on the one-hour lifetime and 1.25 times on the five-minute, so a cut that keeps most of the context is a case for a newer cut or for `/compact`. The `cut-point` skill reads the transcript, lists the cached prompts with the time each stays cached until, and says how to phrase the recommendation; invoke it rather than guessing, and again if the time you quoted has passed.

## The focus line

A focus line steers what the summary keeps, on `/compact` and on a rewind
alike. Everything that must survive the cut goes to disk before you write it:
open work becomes tasks, with the run ids, file paths, and remaining steps in
the task description; a ruling that outlives the session goes to memory; a
finding goes in a file. That leaves the line one clause for the arc and a
pointer to the task holding the state.

`/compact finishing the repo-wide comment and voice pass, task #26`

Decisions and identifiers still matter, and they are on disk by the time the
line is written, so the line says where they are rather than repeating them. A
summary that re-describes what is already written down spends tokens to save
none, and a long focus line is that mistake made in advance.

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

