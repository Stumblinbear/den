# context-budget

A Claude Code plugin that gets the agent to recommend `/compact` or a rewind
summarize while there is still a good cut point, instead of letting
auto-compact choose one for you.

## What it provides

- A context notice. After every tool call and every prompt in the main
  session, a hook measures how full the context is and injects a message the
  first time it crosses each of two thresholds. The first says to finish the
  task in hand and raise it at the next natural stopping point. The second
  says to raise it now, with a named cut point for a rewind summarize.
- A resume guard. Before a message is sent to a subagent, a hook denies
  resuming one whose context is large, or whose prompt cache has expired, and
  tells the agent to put the numbers to you first. A fresh launch is never
  blocked.
- The `context-budget` skill, which the agent loads when it makes that
  recommendation: how a rewind summarize differs from `/compact`, how to pick
  a cut point and a focus line, and how to judge a stopping point.
- The `configure` skill (`/context-budget:configure`): the guided path through
  the configuration and through "why did it do that".

Nothing is shown to you directly. The agent's recommendation is the whole
user-facing surface.

## Requirements and what it does on your machine

The hooks are TypeScript and run with no build step. Claude Code starts them
with `node`, so **Node 22.6 or newer** is the floor. They run under bun
instead whenever `bun` is on `PATH`.

A file named `.runtime` in the plugin's data directory forces the choice for
this plugin. It holds one word, `bun` or `node`:

```sh
echo node > ~/.claude/plugins/data/context-budget-den/.runtime
```

No file is the default above. Anything else is one stderr line naming the file
and a hook run that does nothing.

TOML has no parser in Node, so the hooks depend on `smol-toml`. Claude Code
installs it when it caches the plugin. There is nothing to build and nothing
to run by hand.

What the hooks read: both read your configuration file in the data directory,
on every run. The notice hook reads the last 512 KB of the session transcript,
after every tool call and every prompt. The guard reads, on every message to a
subagent, that subagent's whole transcript and its metadata file, and, only
when the resume is past one of the limits, the whole session transcript, for
your latest answer. They never read your source.

What the hooks write: one JSON file per session under `claude-context-budget/`
in the OS temp directory, holding the level this session has been told about
and the resume answers it has spent, plus a lock directory and a fault marker
beside it. Nothing is written to your project.

What the hooks can do to a session: add a message to the agent's context, and
deny a `SendMessage` to a subagent.

## Installation

In Claude Code:

```
/plugin marketplace add stumblinbear/den
/plugin install context-budget@den
```

Run `/reload-plugins` if the install summary asks for it.

## Quick start

A fresh install is silent. Copy the example configuration into place:

```sh
mkdir -p ~/.claude/plugins/data/context-budget-den
cp <plugin root>/hooks/config.example.toml \
  ~/.claude/plugins/data/context-budget-den/config.toml
```

Nothing else is needed. When a session passes 150K tokens, the agent finishes
what it is doing and then tells you it recommends `/compact` or a rewind
summarize, and which. To see it sooner, lower `notice` under `[default]`.

## Configuration

Both hooks read one file and only one:

    ~/.claude/plugins/data/context-budget-den/config.toml

`hooks/config.example.toml` is the starting point, documented key by key. The
hooks never read it, so a plugin update cannot change what a configured
session runs on. `/context-budget:configure` is the guided path through an
edit.

The file is read on every hook run, so an edit takes effect on the next tool
call with no reload. Nothing is merged under it, so it carries every key
below. A missing key is a config error naming it.

| Key | Type | Default | What it does |
|---|---|---|---|
| `[default] enabled` | bool | `true` | `false` switches the notice off for every model no `[models]` row matches, and waives that table's thresholds |
| `[default] notice` | tokens | required | the first threshold |
| `[default] urgent` | tokens | required | the second threshold |
| `[models.'<regex>'] enabled` | bool | `true` | `false` switches the notice off for every model the row matches, and waives its thresholds |
| `[models.'<regex>'] notice` | tokens | required | the row's first threshold |
| `[models.'<regex>'] urgent` | tokens | required | the row's second threshold |
| `[messages] notice` | string | required | injected on crossing `notice` |
| `[messages] urgent` | string | required | injected on crossing `urgent` |
| `[resume-guard] enabled` | bool | `true` | `false` allows every resume, reads no transcript, and waives the two limits |
| `[resume-guard] large` | tokens | required | the context above which a resume is denied whatever the cache is doing |
| `[resume-guard] cold` | tokens | required | the context above which a resume is denied once the subagent's prompt cache has expired |
| `[resume-guard.messages] denied` | string | required | the deny reason on a first attempt |
| `[resume-guard.messages] used` | string | required | the deny reason when the user's latest answer has already been spent |

`[models]` may be absent altogether. The other four tables are always read,
including `[resume-guard.messages]` when the guard is off.

Row keys are regular expressions in single quotes, matched against the model
id as the transcript records it: `claude-opus-5`, `claude-fable-5-1`,
`claude-haiku-4-5-20251001`. Rows are tried in the order they are written and
the first match wins, so a general row above a specific one hides it.

All four messages are read by the agent, not by you, so they are written as
instructions. `[messages]` substitutes `{model}`, `{tokens}` and
`{threshold}`. `[resume-guard.messages]` substitutes `{agent}`, `{type}`,
`{tokens}`, `{reasons}`, `{large}` and `{cold}`.

## Operation and limitations

The measurement is the newest assistant turn in the transcript: its prompt,
cache-creation and cache-read tokens added together. So the number is one turn
old, and the notice lands after the reply that crossed the line.

Thresholds are absolute token counts, not fractions of a context window. The
hook cannot see the window size. The example's 150K comes from Anthropic's
server-side compaction default on 1M-window models.

Subagents are never measured, and the notice is never injected into one.

A compaction resets the measurement. `/compact`, auto-compact and both rewind
summarize directions leave a boundary in the transcript, and a scan that
reaches one before any assistant turn reports an empty context. Only a rise
injects, but a fall is recorded, so a level that has fired can fire again
after the context comes back up.

The example configuration switches Haiku off, because its 200K window sits
below the 250K urgent threshold and auto-compact would always win.

Auto-compact is Claude Code's own mechanism and runs regardless of this
plugin. All the plugin does is try to get a recommendation made first.

The resume guard only applies to a subagent of the current session that has
already spoken, found by its transcript under the session transcript's
`subagents/` directory. A denied resume is approved by your answer and nothing
else: the guard reads the session transcript for your newest AskUserQuestion
answer and allows the retry only when the option you picked was labeled
"Resume". One answer approves one resume; a second attempt on the same answer
is denied with the `used` message. A `denied` message rewritten to stop asking
for a "Resume" option breaks the retry, since that label is what the guard
looks for.

## Troubleshooting

A configuration the hooks cannot use prints one line on stderr, starting
`context-budget:`, and switches both the notice and the guard off for the rest
of that session. `config error` names the file and what is wrong with it;
`parser error` means `smol-toml` is missing from the plugin's cache
directory. Every run still reads the file, so a fix takes effect on the next
tool call.

`internal error` is the third of them and is not yours to fix: the run
stopped on something the plugin does not account for, and the line ends in
where to report it.

That line is said once per session. The marker that silences it is
`<session id>.config`, `<session id>.parser` or `<session id>.internal`, under
`claude-context-budget/` in the OS temp directory. Delete the marker to hear
it again.

On Node older than 22.6 with no bun on `PATH`, the hooks print one line naming
the floor and the version they found, and do nothing.

To make the current level fire again after editing a message, delete
`<session id>.json` from that same directory. Deleting it also clears the
resume answers the session has spent.

A run killed while it held that file's lock, or one whose release failed even
after its retries, leaves the directory `<session id>.lock` beside it, and
until that directory is deleted every later
run of the session skips its own update of the file without a word: the notice
never fires again, and a resume answer is never marked spent.

## Contributing

See the developer section of the [repository
README](https://github.com/stumblinbear/den#developing).
