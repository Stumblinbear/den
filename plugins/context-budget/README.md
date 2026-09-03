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
- The `context-budget` skill: the two rewind directions, `/compact` with a
  focus line, how to pick and describe a cut point, and how to judge a stopping
  point by task.
- The `configure` skill: what the hook measures and why a notice did or did
  not appear, where overrides go, how they merge, and how to check an edit.

Nothing is shown to the user directly; the agent's recommendation is the whole
user-facing surface.

## Configuration

`hooks/config.toml` holds the thresholds and both injected messages, documented
key by key. To change them, copy it to
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

## Dependencies

TOML has no parser in Node, so the hook depends on `smol-toml`. Claude Code
installs it: when it copies a plugin into its cache it runs
`npm ci --ignore-scripts` in the cached copy whenever the plugin root has a
`package.json` and a `package-lock.json`. Nothing to build, nothing to run by
hand.

If that install did not happen, the hook says so once per session on stderr and
then goes quiet, rather than leaving a dead context notice behind. The fix it
names is reinstalling the plugin, or `npm ci` in its cache directory.
