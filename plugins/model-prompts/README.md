# model-prompts

A Claude Code plugin that puts the prompts you have written for a model into
the main session's context whenever that model becomes the one in use — at
session start, and again when you switch models mid-session.

A rule like "this model writes filler sentences, here is the list" belongs to
the model, not to the project and not to the agent. Kept in a `CLAUDE.md` it
reaches every model; kept in a skill it has to be invoked. Here it is attached
to a regular expression on the model id and arrives on its own.

## What is in it

- A `SessionStart` + `PostModelSwitch` hook that reads the active model id and
  writes the text of every configured row whose key matches it. Rows compose:
  a general rule and a model-specific one both land, in the order they are
  written. Nothing is printed when no row matches.
- `hooks/config.example.toml`: a configuration documented key by key, with an
  Opus 5 writing rule in it, to copy into place and edit. The hook never reads
  it.
- The `configure` skill: what fires and when, where the configuration lives,
  and how to check an edit.

Output goes into the agent's context, not to the user; Claude Code adds what
these two events print on stdout to the conversation.

## Configuration

The hook reads one file:

    ~/.claude/plugins/data/model-prompts-den/config.toml

Nothing is injected until it exists — a fresh install is silent. Copy
`hooks/config.example.toml` there to start from a documented one. It is read
on every hook run, so an edit takes effect on the next session start or model
switch, with no reload.

Each row is a table keyed by a regular expression matched against the model id
(`claude-opus-5`, `claude-fable-5-1`, `claude-haiku-4-5-20251001`):

| Key | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | bool | `true` | `false` injects nothing and needs no text |
| `prompt` | string | | the text; exactly one of `prompt`/`file` |
| `file` | string | | a path relative to the directory of the config file |
| `on_start` | bool | `true` | inject at session start |
| `on_switch` | `"every"`/`"once"`/`"never"` | `"once"` | inject on a switch into a matching model |

Every row whose key matches injects, in the order the rows are written in the
file.

`on_switch = "once"` means "this row's text is already in this context": a
session start records what it injected too, so starting on a model, switching
away and switching back does not say the same thing twice. Every session start
clears that record first, because every reason it fires for — startup, resume,
clear, compact, fork — builds the context again from nothing.

The model comes from the hook input: `to_model` on a switch, `model` at
session start. Every id the input names is remembered for the session, since
session start does not always carry one — a session is still on the model its
last input named, so that is read back first. A session no input has ever
named a model for falls through to the `model` in `~/.claude/settings.json` —
a guess, and one that misses project settings and aliases like `"opus"`, and
never remembered as the answer. When there is nothing to go on, nothing is
injected.

## Dependencies

TOML has no parser in Node, so the hook depends on `smol-toml`. Claude Code
installs it: when it copies a plugin into its cache it runs
`npm ci --ignore-scripts` in the cached copy whenever the plugin root has a
`package.json` and a `package-lock.json`. Nothing to build, nothing to run by
hand.

The hook keeps no second set of values to run on. If the parser will not
import, or if the config file cannot be read, parsed, or used, the first hook
run of the session that meets the problem prints one line on stderr — naming
what is wrong, which file, and the fix — and nothing is injected while the
problem stands. That report is silenced for the rest of the session, but every
run still reads the file, so a fix takes effect on the next session start or
model switch.

## Running

The hook is TypeScript and runs without a build step: `hooks.json` starts
`hooks/launch.mjs` with plain `node`, and that launcher runs the hook under
bun when bun is on `PATH`, and otherwise under Node's own type stripping,
which needs **Node 22.6 or newer**.

A file named `.runtime` beside the configuration, holding one word, forces the
choice:

```sh
echo node > ~/.claude/plugins/data/model-prompts-den/.runtime
```

`bun` and `node` are the two it takes; no file is the default above, and
anything else is one stderr line naming the file and a hook run that does
nothing.
