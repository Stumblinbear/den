---
name: configure
description: Use when the user asks how the model-prompts plugin works, why a prompt for a model did or did not appear at session start or after a /model switch, or wants to change what is injected — adding or editing a per-model row, keeping the text in a file, switching a row off, or choosing whether a row repeats on every switch.
---

# Configuring model-prompts

## What fires and when

A hook runs on two events in the main session: `SessionStart` (for every
reason it fires — startup, resume, clear, compact, fork) and
`PostModelSwitch`. It works out which model the session is now on, collects
every configured row whose key matches that model id, and writes their text to
stdout, which Claude Code adds to the agent's context.

The output is one fixed header line, `Rules for the current model (<model
id>):`, then each matching row's text separated by a blank line. Nothing at
all is printed when no row fires.

Consequences that answer most "why did it" questions:

- **Nothing is injected until the configuration file exists.** A fresh install
  has none, and says nothing about that.
- **Rows compose.** Every match injects, in the order the rows are written in
  the file. This is not first-match-wins, so a general row and a
  model-specific row both land.
- **The model at session start is sometimes a guess.** `PostModelSwitch`
  carries `to_model` and is exact. `SessionStart` carries `model` only
  sometimes. Every id an input names is recorded for the session, so a run
  carrying none reads back the one the last input named; only a session no
  input has ever named a model for falls through to the `model` in
  `~/.claude/settings.json`. That last step misses project-level settings and
  aliases like `"opus"`, is never recorded as the answer, and when it finds
  nothing, nothing is injected.
- **Subagents never see any of this.** `SessionStart` does not fire for them,
  and input carrying an `agent_id` is ignored.
- The session's record is `<os temp dir>/claude-model-prompts/<session id>.json`,
  and it is the only file a session leaves there: what has been injected, the
  model an input last named, and the faults it has been told about (below).
  Deleting it makes a `once` row fire again, which is the quickest way to see
  an edit take effect without restarting.
- One stderr line starting `model-prompts:` says what the hook could not use,
  and nothing is injected while that stands: `parser error` is a missing
  `smol-toml` in the plugin's cache directory, `config error` names the file
  that cannot be read, parsed, or used, and `internal error` is a failure of
  the hook's own with nothing in the configuration to fix. The line is said
  once per session, listed in the record above once it has been — delete the
  record to hear it again. Every run still reads the file, so a fix takes
  effect on the next one, without the line being repeated.

## Where changes go

The hook reads one file and only one:

    ~/.claude/plugins/data/model-prompts-den/config.toml

The `-den` suffix is the marketplace name the plugin was installed from. The
directory survives plugin updates.

`../../hooks/config.example.toml` from this file is an example to copy there,
documented key by key and carrying an Opus 5 writing rule. The hook never
reads it, and a plugin update replaces it, so the copy is where edits go:

    cp <plugin root>/hooks/config.example.toml \
      ~/.claude/plugins/data/model-prompts-den/config.toml

It is read on every hook run, so an edit takes effect on the next session
start or model switch with no reload.

Read the Configuration section of `../../README.md` before writing a row: it
is the table of every key in a row, its type and its default, along with how a
row key is matched and what `on_switch` means. Two things it does not say,
which decide how a row is written:

- Write `on_switch = "every"` for a rule about how the model behaves rather
  than about the task, since the behavior comes back with the model and the
  task does not; the example Opus row is `"every"` for that reason.
- The text is read by the agent, not the user, so write it as an instruction
  with its reason attached, the way the example does.

## Checking a change

A TOML typo, or a row the hook cannot use, is not quietly dropped: nothing is
injected while it stands, and the hook says so once per session on stderr. Run
the hook by hand from the plugin root to see what it will inject, or what it
objects to:

    printf '%s' '{"session_id":"check","hook_event_name":"SessionStart","session_start_reason":"startup","model":"claude-opus-5"}' \
      | node lib/shared/launch.mjs --data ~/.claude/plugins/data/model-prompts-den \
        hooks/model-prompts --config ~/.claude/plugins/data/model-prompts-den/config.toml

Output is the header and the matching text, or nothing when no row matches.
Swap the input for a switch to see the other event:

    printf '%s' '{"session_id":"check","hook_event_name":"PostModelSwitch","to_model":"claude-opus-5"}' \
      | node lib/shared/launch.mjs --data ~/.claude/plugins/data/model-prompts-den \
        hooks/model-prompts --config ~/.claude/plugins/data/model-prompts-den/config.toml

Delete `claude-model-prompts/check.json` from the temp directory afterwards.

## Running it at all

The hook is TypeScript with no build step. `hooks.json` starts
`lib/shared/launch.mjs` with plain `node`; that launcher runs the hook under
bun when `bun --version` answers on `PATH`, and otherwise under Node's own
type stripping, which needs **Node 22.6 or newer**. On an older Node the
launcher prints one line naming the floor and the version it found, and
nothing is injected.

A file named `.runtime` in the data directory forces the choice for this
plugin. It holds one word:

```sh
echo node > ~/.claude/plugins/data/model-prompts-den/.runtime
```

`bun` and `node` are the two it takes; no file is the default above, and
anything else is one stderr line naming the file and a failed hook run.
