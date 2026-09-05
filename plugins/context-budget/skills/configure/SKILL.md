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

- **Nothing is measured or guarded until the configuration file exists.** A
  fresh install has none, and says nothing about that.
- The number is one turn old. The notice lands after the reply that crossed
  the line, and a fresh session reads as empty until its first reply.
- Subagents are never measured; only the main session is.
- Haiku is switched off in the example configuration, because its 200K window
  sits below the 250K urgent threshold and auto-compact would always win.
- Auto-compact is Claude Code's own mechanism and runs regardless of this
  plugin; the plugin only tries to get a recommendation made before it does.
- The per-session record is `<os temp dir>/claude-context-budget/<session id>.json`:
  the level this session has been told about, and the resume answers it has
  spent. Deleting it makes the current level fire again, which is the quickest
  way to see a message after editing it.
- One stderr line starting `context-budget:` means both the notice and the
  resume guard are off, and says why: `parser error` is a missing `smol-toml`
  in the plugin's cache directory, `config error` names the file that cannot
  be read, parsed, or used, and `internal error` is a failure of the plugin's
  own with nothing in the configuration to fix. Nothing is measured and
  nothing is guarded until it is fixed; fixing it takes effect on the next
  hook run. The line is said once per session, marked by `<session
  id>.parser`, `<session id>.config` or `<session id>.internal` beside the
  record above — delete the marker to hear it again.

The resume guard is the second hook, on every `SendMessage` to a subagent of
this session. It reads the newest assistant turn of that subagent's own
transcript, beside the session transcript under `subagents/`, for its context
size, when it last ran, and which prompt-cache lifetime it was billed under.
The resume is refused when the context is above `large`, or above `cold` with
that cache lifetime already elapsed, and the refusal tells the agent to put the
numbers to the user through AskUserQuestion with an option labeled "Resume".
The retry is allowed only when the user's newest answer in the session
transcript picked that option: the guard reads the answer itself, so nothing
the agent claims can stand in for it. One answer approves one resume, whose
uuid is then in the session record above; a second retry on the same answer is
refused with the `used` message.

## Where changes go

Both hooks read one file and only one:

    ~/.claude/plugins/data/context-budget-den/config.toml

The `-den` suffix is the marketplace name the plugin was installed from. The
directory survives plugin updates.

`../../hooks/config.example.toml` from this file is an example to copy there,
documenting every key. The hooks never read it, and a plugin update replaces
it, so the copy is where edits go:

    cp <plugin root>/hooks/config.example.toml \
      ~/.claude/plugins/data/context-budget-den/config.toml

It is read on every hook run, so an edit takes effect on the next tool call
with no reload.

Nothing is merged under it, so it carries every key both hooks read, and a
missing one is a `config error` naming the section and the key. Read the
Configuration section of `../../README.md` before writing an edit: it is the
table of every key, its type and its default, along with how a row key is
matched and what each message substitutes.

## Checking a change

A TOML typo, a missing key, or a value neither hook can use is not quietly
dropped: it switches both of them off for the session and says so once on
stderr. Run a hook by hand from the plugin root against a real transcript to
see what it will inject, or what it objects to:

    printf '%s' '{"session_id":"check","transcript_path":"<a .jsonl under ~/.claude/projects/>","hook_event_name":"UserPromptSubmit"}' \
      | node lib/launch.mjs --data ~/.claude/plugins/data/context-budget-den \
        hooks/context-budget --config ~/.claude/plugins/data/context-budget-den/config.toml

Output is the injection JSON, or nothing when the transcript is below the
first threshold. Delete `claude-context-budget/check.json` from the temp
directory afterwards, along with any `check.parser` or `check.config` marker
beside it.

The guard takes a `SendMessage` input naming a subagent of that transcript,
one with an `agent-<name>.jsonl` under the transcript's `subagents/` directory:

    printf '%s' '{"session_id":"check","transcript_path":"<the .jsonl>","hook_event_name":"PreToolUse","tool_name":"SendMessage","tool_input":{"to":"<name>"}}' \
      | node lib/launch.mjs --data ~/.claude/plugins/data/context-budget-den \
        hooks/resume-guard --config ~/.claude/plugins/data/context-budget-den/config.toml

Output is the deny JSON with the filled message, or nothing when the resume
is allowed.

## Running it at all

The hooks need **Node 22.6 or newer**, and run under bun instead when `bun
--version` answers on `PATH`. On an older Node with no bun, one stderr line
names the floor and the version it found, and nothing is injected or guarded.

A file named `.runtime` in the data directory forces the choice for this
plugin. It holds one word:

```sh
echo node > ~/.claude/plugins/data/context-budget-den/.runtime
```

`bun` and `node` are the two it takes; no file is the default above, and
anything else is one stderr line naming the file and a failed hook run.
