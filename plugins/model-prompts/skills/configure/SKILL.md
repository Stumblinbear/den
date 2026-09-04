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
- The per-session record of what has been injected, and of the model an input
  last named, is
  `<os temp dir>/claude-model-prompts/<session id>.json`. Deleting it makes a
  `once` row fire again, which is the quickest way to see an edit take effect
  without restarting.
- One stderr line starting `model-prompts:` says what the hook could not use,
  and nothing is injected while that stands: `parser error` is a missing
  `smol-toml` in the plugin's cache directory, `config error` names the file
  that cannot be read, parsed, or used. The line is said once per session,
  marked by `<session id>.parser` or `<session id>.config` beside the record
  above — delete the marker to hear it again. Every run still reads the file,
  so a fix takes effect on the next one, without the line being repeated.

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

Rows:

- A row is `[models.'<regex>']`. Single quotes make the key a TOML literal
  string, so regex backslashes need no escaping. The key is matched against
  the model id as Claude Code reports it: `claude-opus-5`,
  `claude-fable-5-1`, `claude-haiku-4-5-20251001`.
- Every matching row injects, in the order the rows are written. A row moved
  above another speaks before it.
- `enabled = false` keeps a row in the file and stops it injecting, so a rule
  can be parked without being deleted.

Keys in a row:

| Key | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | bool | `true` | `false` injects nothing and needs no text |
| `prompt` | string | | the text; exactly one of `prompt`/`file` |
| `file` | string | | a path relative to the directory of the config file |
| `on_start` | bool | `true` | inject at session start |
| `on_switch` | `"every"`/`"once"`/`"never"` | `"once"` | inject on a switch into a matching model |

`on_switch` reads as "this row's text is already in this context":

- `"once"` injects on the first switch into a matching model and then stays
  quiet, because the text is still up there. A session start clears what was
  injected and re-arms it.
- `"every"` injects on each switch. Use it for a rule about how the model
  behaves rather than about the task, since the behavior comes back with the
  model; the example Opus row is `"every"` for that reason.
- `"never"` leaves the row to session start alone.

Text:

- `prompt = """..."""` keeps the text inline. `file = "rules.md"` keeps it in
  its own file beside the config file, which is easier to edit and reads as
  prose in a diff. A row carries one or the other, never both.
- The text is read by the agent, not the user, so write it as an instruction
  with its reason attached, the way the example does.

## Checking a change

A TOML typo, or a row the hook cannot use, is not quietly dropped: nothing is
injected while it stands, and the hook says so once per session on stderr. Run
the hook by hand from the plugin root to see what it will inject, or what it
objects to:

    printf '%s' '{"session_id":"check","hook_event_name":"SessionStart","session_start_reason":"startup","model":"claude-opus-5"}' \
      | node hooks/launch.mjs --data ~/.claude/plugins/data/model-prompts-den \
        model-prompts --config ~/.claude/plugins/data/model-prompts-den/config.toml

Output is the header and the matching text, or nothing when no row matches.
Swap the input for a switch to see the other event:

    printf '%s' '{"session_id":"check","hook_event_name":"PostModelSwitch","to_model":"claude-opus-5"}' \
      | node hooks/launch.mjs --data ~/.claude/plugins/data/model-prompts-den \
        model-prompts --config ~/.claude/plugins/data/model-prompts-den/config.toml

Delete `claude-model-prompts/check.json` from the temp directory afterwards,
along with any `check.parser` or `check.config` marker beside it.

## Running it at all

The hook is TypeScript with no build step. `hooks.json` starts
`hooks/launch.mjs` with plain `node`; that launcher runs the hook under bun
when `bun --version` answers on `PATH`, and otherwise under Node's own type
stripping, which needs **Node 22.6 or newer**. On an older Node the launcher
prints one line naming the floor and the version it found, and nothing is
injected.

A file named `.runtime` in the data directory forces the choice for this
plugin. It holds one word:

```sh
echo node > ~/.claude/plugins/data/model-prompts-den/.runtime
```

`bun` and `node` are the two it takes; no file is the default above, and
anything else is one stderr line naming the file and a failed hook run.
