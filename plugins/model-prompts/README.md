# model-prompts

A Claude Code plugin that puts the rules you have written for a model into the
session whenever that model becomes the one in use. A rule like "this model
writes filler sentences, here is the list" belongs to the model, not to the
project, and this is how it follows the model.

## What it provides

- A hook on session start and on a model switch. It works out which model the
  main session is now on, and writes the text of every configured row whose
  key matches that model id into the agent's context. Nothing is printed when
  no row matches.
- The `configure` skill (`/model-prompts:configure`): the guided path through
  the configuration and through "why did it not appear".

The text goes to the agent, not to you. Nothing is shown on screen, and no
tool call is ever blocked.

## Requirements and what it does on your machine

The hook is TypeScript and runs with no build step. Claude Code starts it with
`node`, so **Node 22.6 or newer** is the floor. It runs under bun instead
whenever `bun` is on `PATH`.

A file named `.runtime` in the plugin's data directory forces the choice for
this plugin. It holds one word, `bun` or `node`:

```sh
echo node > ~/.claude/plugins/data/model-prompts-den/.runtime
```

No file is the default above. Anything else is one stderr line naming the file
and a hook run that does nothing.

TOML has no parser in Node, so the hook depends on `smol-toml`. Claude Code
installs it when it caches the plugin. There is nothing to build and nothing
to run by hand.

What the hook reads: your configuration file in the data directory, any file a
row points at, and, only when it has nothing else to go on, the `model` field
of `~/.claude/settings.json`. It never reads your source or your transcript.

What the hook writes: one JSON file per session under `claude-model-prompts/`
in the OS temp directory, holding which rows are already in this context and
the model an input last named, plus a fault marker beside it. Nothing is
written to your project.

What the hook can do to a session: add text to the main session's context at
session start and on a model switch.

## Installation

In Claude Code:

```
/plugin marketplace add stumblinbear/den
/plugin install model-prompts@den
```

Run `/reload-plugins` if the install summary asks for it.

## Quick start

A fresh install is silent. Copy the example configuration into place:

```sh
mkdir -p ~/.claude/plugins/data/model-prompts-den
cp <plugin root>/hooks/config.example.toml \
  ~/.claude/plugins/data/model-prompts-den/config.toml
```

It carries one row, a writing rule for Opus 5. Start a session on Opus 5, or
switch to it, and the rule is in the agent's context from that moment. Edit
the row, or add your own, and the next session start or switch picks it up.

## Configuration

The hook reads one file and only one:

    ~/.claude/plugins/data/model-prompts-den/config.toml

`hooks/config.example.toml` is the starting point, documented key by key. The
hook never reads it, so a plugin update cannot change what a configured
session runs on. `/model-prompts:configure` is the guided path through an
edit.

The file is read on every hook run, so an edit takes effect on the next
session start or model switch with no reload.

Each row is `[models.'<regex>']`. Single quotes make the key a TOML literal
string, so regex backslashes need no escaping. The key is matched against the
model id as Claude Code reports it: `claude-opus-5`, `claude-fable-5-1`,
`claude-haiku-4-5-20251001`. A file with no `[models]` table injects nothing.

| Key | Type | Default | What it does |
|---|---|---|---|
| `enabled` | bool | `true` | `false` parks the row: it injects nothing and needs no text |
| `prompt` | string | required unless `file` | the text to inject |
| `file` | string | required unless `prompt` | a file holding the text, resolved against the directory of the config file |
| `on_start` | bool | `true` | inject at session start |
| `on_switch` | `"every"`, `"once"`, `"never"` | `"once"` | inject on a switch into a matching model |

A row carries `prompt` or `file`, never both and never neither.

## Operation and limitations

Every row whose key matches injects, in the order the rows are written in the
file. This is not first-match-wins, so a general rule and a model-specific one
both land.

`on_switch = "once"` means "this row's text is already in this context". A
session start records what it injected too, so starting on a model, switching
away and switching back does not say the same thing twice. Every session start
clears that record first, because every reason it fires for, startup, resume,
clear, compact and fork, builds the context again from nothing.

The model on a switch is exact. At session start it sometimes is not. Claude
Code carries the model id on a session start only sometimes, so a run without
one falls back to the model the session's last input named. A session no input
has ever named a model for falls back once more, to the `model` field of
`~/.claude/settings.json`. That last step is a guess: it misses project
settings and aliases such as `"opus"`, and it is never recorded as the answer.
When there is nothing to go on, nothing is injected.

Subagents get nothing. Session start does not fire for them, and a rule
written for the model the main session is driving is not automatically a rule
for an agent that happens to share it.

## Troubleshooting

A configuration the hook cannot use prints one line on stderr, starting
`model-prompts:`, and nothing is injected while it stands. `config error`
names the file and what is wrong with it, down to the row; `parser error`
means `smol-toml` is missing from the plugin's cache directory. Every run
still reads the file, so a fix takes effect on the next session start or
switch.

`internal error` is the third of them and is not yours to fix: the run
stopped on something the hook does not account for, and the line ends in where
to report it.

That line is said once per session. The marker that silences it is
`<session id>.config`, `<session id>.parser` or `<session id>.internal`, under
`claude-model-prompts/` in the OS temp directory. Delete the marker to hear it
again.

On Node older than 22.6 with no bun on `PATH`, the hook prints one line naming
the floor and the version it found, and injects nothing.

To make a `once` row inject again without restarting, delete
`<session id>.json` from that same directory.

## Contributing

See the developer section of the [repository
README](https://github.com/stumblinbear/den#developing).
