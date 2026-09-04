# context-budget

A Claude Code plugin that tells the agent when the session's context has
crossed a per-model token threshold, so it finishes the task in hand and then
recommends `/compact` or a rewind summarize — instead of letting auto-compact
choose the cut point.

## What is in it

- A `PostToolUse` + `UserPromptSubmit` hook that reads the tail of the session
  transcript for the newest assistant turn, sums its prompt, cache-creation and
  cache-read tokens, and compares that against a per-model threshold pair.
  Crossing `notice` injects a message telling the agent to raise it at the next
  natural stopping point; crossing `urgent` injects one telling it to raise it
  now and to recommend a `Summarize up to here` rewind with a named cut point.
  Each level injects once per session and re-arms if the context falls back
  below it, which is what a compact or a summarize produces.
- A snapshot of the prompt cache inside both injected messages. A rewind at a
  prompt re-reads everything before it, and that prefix is cached only while
  the prompt itself is younger than the session's cache lifetime — so the
  snapshot lists three cached prompts spread across the context, the oldest,
  the newest and the one nearest halfway between them by size, each a row
  carrying the clock time it falls out, what a cut there summarizes away and
  what it keeps verbatim; the agent is told to hand the user that deadline with
  the recommendation. Where the session was compacted and kept prompts
  verbatim, the reading names them, since a rewind at one of them costs at most
  the context the compaction left behind. It is read by walking the transcript
  backward, only on the run that injects; the runs that measure and stay quiet
  keep their fixed tail read.
- The `cut-point` skill, `/context-budget:cut-point`: the identical reading
  taken fresh — one renderer prints both — listing the same three cut points
  with their expiry and their two sizes, since everything newer than the oldest
  is cached too and a busy hour would otherwise print dozens of interchangeable
  rows. For when the snapshot in the message has aged out, or the user asks for
  another cut point. It finds the session's transcript through the record the
  hook writes on every run, so it works from the session's first tool call
  whether or not anything has been injected.
- The `context-budget` skill: the "Summarize up to here" rewind, `/compact`
  with a focus line, how to pick and describe a cut point, and how to judge a
  stopping point by task.
- A `PreToolUse` resume guard on `SendMessage` that denies resuming a subagent
  whose context is above 150K tokens, or above 50K with an expired prompt
  cache, until the user picks "Resume" in an AskUserQuestion prompt. A resumed
  subagent re-reads its whole transcript every turn, so past those sizes a
  fresh launch is cheaper. Whether the cache has expired is measured from the
  subagent's last turn against the lifetime the last turn that wrote to the
  cache was billed under.
- The `configure` skill: what the hook measures and why a notice did or did
  not appear, where overrides go, how they merge, and how to check an edit.

Nothing is shown to the user directly; the agent's recommendation is the whole
user-facing surface.

## Configuration

`hooks/config.toml` holds the thresholds, the guard's limits and all four
injected messages, documented key by key. To change them, copy it to
`~/.claude/plugins/data/context-budget-den/config.toml` — that path survives
plugin updates, and the values there are merged over the shipped ones key by
key, so it only needs the keys it changes.

Thresholds are absolute input token counts, not fractions of a context window.
The shipped defaults — notice at 150K, urgent at 250K — take 150K from
Anthropic's server-side compaction default on 1M-window models, which is the
one published anchor for "this conversation is large".

Rows are per-model and keyed by a regular expression on the model id, tried
before the default. A row can also carry `enabled = false` instead of
thresholds, which switches the plugin off for that model; Haiku ships that way,
because its 200K window is smaller than the 250K urgent threshold and
auto-compact would always fire first.

The resume guard reads the same file: `[resume-guard]` holds its two limits and
an `enabled` switch, and `[resume-guard.messages]` holds the two deny reasons
it hands back to the agent.

## Dependencies

TOML has no parser in Node, so both hooks depend on `smol-toml`. Claude Code
installs it: when it copies a plugin into its cache it runs
`npm ci --ignore-scripts` in the cached copy whenever the plugin root has a
`package.json` and a `package-lock.json`. Nothing to build, nothing to run by
hand.

Neither hook keeps a second set of values to run on. If the parser will not
import, or if either config file cannot be read, parsed, or used, the first
hook run of the session that meets the problem prints one line on stderr —
naming what is wrong, which file, and the fix — and the context notice and the
resume guard are then both off for the rest of that session, silently. A plugin
running on numbers nobody wrote would be worse than one that says it is not
running. Fix the file and the next hook run picks it up.
