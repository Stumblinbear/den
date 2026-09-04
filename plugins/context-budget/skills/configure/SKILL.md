---
name: configure
description: Use when the user asks how the context-budget plugin works, why a context notice did or did not appear, why resuming a subagent was denied, or wants to change when either fires — thresholds, per-model rows, switching a model off, the resume guard's limits, or the wording of any of the messages.
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
- One stderr line starting `context-budget:` means both the notice and the
  resume guard are off, and says why: `parser error` is a missing `smol-toml`
  in the plugin's cache directory, `config error` names the file that cannot
  be read, parsed, or used. Nothing is measured and nothing is guarded until
  it is fixed; fixing it takes effect on the next hook run. The line is said
  once per session, marked by `<session id>.parser` or `<session id>.config`
  beside the record above — delete the marker to hear it again.

The resume guard is the second hook, on every `SendMessage` to a subagent of
this session. It reads the newest assistant turn of that subagent's own
transcript, beside the session transcript under `subagents/`, for its context
size, when it last ran, and which prompt-cache lifetime it was billed under.
The resume is refused when the context is above `large`, or above `cold` with
that cache lifetime already elapsed, and the refusal tells the agent to put the
numbers to the user through AskUserQuestion with an option labeled "Resume".
The retry is allowed only when the user's newest answer in the session
transcript picked that option: the guard reads the answer itself, so nothing
the agent claims can stand in for it. One answer approves one resume, recorded
as a marker named by the answer's uuid under `<os temp dir>/claude-resume-guard/`;
a second retry on the same answer is refused with the `used` message.

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
- `[resume-guard]` merges key by key, and `[resume-guard.messages]` inside
  it merges key by key of its own, so an override can replace one deny
  message and keep the other. `enabled = false` there switches the resume
  guard off: every resume is allowed, and no transcript is read.

Values:

- Thresholds are absolute token counts, not fractions of a window: the
  hook does not know the window size, and the `[1m]` suffix on a configured
  model never reaches the transcript. The shipped 150K is Anthropic's
  server-side compaction default on 1M-window models; raise or lower from
  there by how much the user is willing to spend per turn.
- Row keys are regular expressions in single quotes, matched against the
  model id as the transcript records it: `claude-fable-5-1`,
  `claude-opus-5`, `claude-haiku-4-5-20251001`.
- All four messages are read by the agent, not the user, so write them as
  instructions with the reason attached, the way the shipped ones are. The
  notice pair substitutes `{model}`, `{tokens}` and `{threshold}`; the
  guard pair substitutes `{agent}`, `{type}`, `{tokens}`, `{reasons}`,
  `{large}` and `{cold}`, where `{reasons}` is the computed list of limits
  that fired. A `denied` message that stops asking for the "Resume" option
  breaks the retry, since that option's label is what the guard looks for.

## Checking a change

A TOML typo, or a value neither hook can use, is not quietly dropped: it
switches both of them off for the session and says so once on stderr. Run the
hook by hand from the plugin root against a real transcript to see what it will
inject, or what it objects to:

    printf '%s' '{"session_id":"check","transcript_path":"<a .jsonl under ~/.claude/projects/>","hook_event_name":"UserPromptSubmit"}' \
      | node hooks/context-budget.mjs --defaults hooks/config.toml --overrides ~/.claude/plugins/data/context-budget-den/config.toml

Output is the injection JSON, or nothing when the transcript is below the
first threshold. Delete `claude-context-budget/check.json` from the temp
directory afterwards.

The guard takes a `SendMessage` input naming a subagent of that transcript,
one with an `agent-<name>.jsonl` under the transcript's `subagents/` directory:

    printf '%s' '{"session_id":"check","transcript_path":"<the .jsonl>","hook_event_name":"PreToolUse","tool_name":"SendMessage","tool_input":{"to":"<name>"}}' \
      | node hooks/resume-guard.mjs --defaults hooks/config.toml --overrides ~/.claude/plugins/data/context-budget-den/config.toml

Output is the deny JSON with the filled message, or nothing when the resume
is allowed.
