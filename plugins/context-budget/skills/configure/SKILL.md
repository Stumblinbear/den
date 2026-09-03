---
name: configure
description: Use when the user asks how the context-budget plugin works, why a context notice did or did not appear, or wants to change when it fires — thresholds, per-model rows, switching a model off, or the wording of the injected messages.
---

# Configuring context-budget

## What fires and when

A hook runs after every tool call and every prompt in the main session. It
reads the newest assistant turn from the session transcript and sums that
turn's prompt, cache-creation and cache-read tokens: the size of the context
the model was last sent. Against that number it holds two levels, `notice`
and `urgent`, and injects the matching message into the agent's context the
first time each is crossed. A compaction or rewind summarize clears the record,
and a level re-arms whenever the context falls back below it.

Consequences that answer most "why did it" questions:

- The number is one turn old. The notice lands after the reply that crossed
  the line, and a fresh session reads as empty until its first reply.
- Subagents are never measured; only the main session is.
- Haiku is switched off in the shipped config, because its 200K window sits
  below the 250K urgent threshold and auto-compact would always win.
- Auto-compact is Claude Code's own mechanism and runs regardless of this
  plugin; the plugin only tries to get a recommendation made before it does.
- The per-session record is `<os temp dir>/claude-context-budget/<session id>.json`.
  Deleting it makes the current level fire again, which is the quickest way to
  see a message after editing it.
- One stderr line starting `context-budget:` means the `smol-toml` dependency
  is missing from the plugin's cache directory; it names the fix. The hook
  then stays quiet for the rest of that session.

## Where changes go

The shipped config is `../../hooks/config.toml` from this file, and it
documents every key. It is replaced on every plugin update, so changes go in
the override file instead:

    ~/.claude/plugins/data/context-budget-den/config.toml

The `-den` suffix is the marketplace name the plugin was installed from. The
override holds only the keys that change, and it is read on every hook run, so
an edit takes effect on the next tool call with no reload.

Merge rules, one per section:

- `[default]` and `[messages]` merge key by key: an override with only
  `notice` keeps the shipped `urgent`.
- `[models.'<regex>']` rows are tried in order and the first match wins.
  An override row with the same key replaces the shipped row; a row with a
  new key is appended after all shipped rows. So to change a model the
  shipped file already matches, reuse its key exactly: `[models.'haiku']`
  with thresholds re-enables Haiku, while `[models.'claude-haiku']` sits
  behind the shipped `'haiku'` row and is never reached.
- `enabled = false` on a row switches the plugin off for every model that
  row matches; on `[default]` it switches off every model no row matches.

Values:

- Thresholds are absolute token counts, not fractions of a window: the
  hook does not know the window size, and the `[1m]` suffix on a configured
  model never reaches the transcript. The shipped 150K is Anthropic's
  server-side compaction default on 1M-window models; raise or lower from
  there by how much the user is willing to spend per turn.
- Row keys are regular expressions in single quotes, matched against the
  model id as the transcript records it: `claude-fable-5-1`,
  `claude-opus-5`, `claude-haiku-4-5-20251001`.
- The two messages are read by the agent, not the user, so write them as
  instructions with the reason attached, the way the shipped ones are. The
  placeholders `{model}`, `{tokens}` and `{threshold}` are substituted
  before injection.

## Checking a change

A malformed override is ignored rather than fatal, so a TOML typo silently
falls back to the shipped values. Run the hook by hand from the plugin root
against a real transcript to see what it will inject:

    printf '%s' '{"session_id":"check","transcript_path":"<a .jsonl under ~/.claude/projects/>","hook_event_name":"UserPromptSubmit"}' \
      | node hooks/context-budget.mjs --defaults hooks/config.toml --overrides ~/.claude/plugins/data/context-budget-den/config.toml

Output is the injection JSON, or nothing when the transcript is below the
first threshold. Delete `claude-context-budget/check.json` from the temp
directory afterwards.
