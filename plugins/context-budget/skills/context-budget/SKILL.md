---
name: context-budget
description: Use when the session's context is filling and you need to recommend `/compact` or a rewind summarize to the user — how the two summarize directions differ, how to pick and describe a cut point and a focus line, and how to judge a natural stopping point for the task in hand.
---

# Context budget

Three ways to shrink a session, differing only in where the cut falls and who
can make it:

| | kept verbatim | summarized | run by |
|---|---|---|---|
| `/compact [focus]` | a recent tail, size chosen for you | everything before it | you or the user |
| rewind, "Summarize up to here" | everything from the selected prompt on | everything before it | the user only |
| rewind, "Summarize from here" | everything before the selected prompt | everything from it on | the user only |

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
- **"Summarize from here"** — the recent stretch is the disposable part: a long
  debugging detour, a search that went nowhere, a file dump you have finished
  reading. The setup before it is what you still need.

## Naming the cut point

Look for the prompt where the work you are still doing began — usually the
first prompt of the current task, not the most recent one. A good cut point has
nothing after it that you would be sorry to lose and nothing before it that you
are still leaning on.

Give the user the opening words of that prompt verbatim, enough to be unique in
the list ("Now implement the plugin described in..."), because the picker shows
their prompts and they have to find it. Naming the position ("three prompts
ago") does not survive scrolling.

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
- a subagent in flight: after its report has been relayed to the user
- a red-then-green fix: after green

At the urgent threshold, the stopping point is the end of the step you are in.
Do not open a new file, launch a subagent, or start a step you cannot finish.

## Tuning

The thresholds and both injected messages live in the plugin's `config.toml`.
Overrides go in `~/.claude/plugins/data/context-budget-den/config.toml`, which
survives plugin updates and is merged over the shipped values key by key; the
shipped file documents every key. If the notice fires too early or too late,
the `[default]` row is the thing to change, or a per-model row keyed by a regex
on the model id; a row carrying `enabled = false` switches the plugin off for
that model entirely.
