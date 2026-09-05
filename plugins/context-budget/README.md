# context-budget

A Claude Code plugin that gets the agent to recommend `/compact` or a rewind
summarize while there is still a good cut point, instead of letting
auto-compact choose one for you.

## What it provides

- A context notice. After every tool call and every prompt in the main
  session, a hook measures how full the context is and injects a message the
  first time it crosses each of two thresholds. The first says how large the
  session is and to raise it at the end of the arc in hand. The second says to
  raise it at the end of the step in hand instead. Neither names a cut point.
- A resume guard. Before a message is sent to a subagent, a hook denies
  resuming one whose context is large, or whose prompt cache has expired, and
  tells the agent to put the numbers to you first. A fresh launch is never
  blocked.
- The `cut-point` skill (`/context-budget:cut-point`), which the messages send
  the agent to: a reading of the prompt cache taken at the moment it is asked
  for. A rewind at a prompt re-reads everything before it, and that stretch is
  cached only while the prompt itself is younger than the session's cache
  lifetime, so the reading lists three still-cached prompts spread across the
  context: each with the clock time it falls out, what a cut there summarizes
  away, what it keeps verbatim, and how many more turns the session has to
  take before the cut has paid for what it cost.
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

What is read: both hooks read your configuration file in the data directory,
on every run. The notice hook reads the last 512 KB of the session transcript,
after every tool call and every prompt. The guard reads, on every message to a
subagent, that subagent's whole transcript and its metadata file, and, only
when the resume is past one of the limits, the whole session transcript, for
your latest answer. The `cut-point` skill's command reads the session
transcript backward from its end, as far back as the cached stretch goes, and
the two price files below. Nothing here reads your source.

What is written: one JSON file per session under `claude-context-budget/` in
the OS temp directory, holding the transcript the last measuring run read, the
level this session has been told about, the resume answers it has spent and the
faults it has been told about, plus a lock directory beside it while a hook is
writing, and a second one for the moment a run spends taking over a lock left
by a run that died. Nothing is written to your project.

What they can do to a session: add a message to the agent's context, and deny
a `SendMessage` to a subagent.

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

One thing the `cut-point` skill needs is not in that file and is not
configuration: what a model charges for a token read from the prompt cache,
against one fresh input token, which is the rate every payback figure is
priced at. It ships as `lib/pricing.toml`, `default = 0.1` with a `[models]`
row `'fable' = 0.025`, keyed the same way as the rows above. A file of the
same shape at

    ~/.claude/plugins/data/context-budget-den/pricing.toml

corrects a rate that has gone out of date: a row whose key matches a shipped
one replaces it where it stands, a row with a new key is tried after all the
shipped ones, and `default` replaces `default`. Every value has to be a number
above 0 and at most 1. Almost nobody needs one.

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
reaches one before any assistant turn reports a compaction rather than a
measurement: the session is put back to no level at all, whatever governs the
model, and the next turn is measured against the thresholds afresh. Only a
rise injects, but a fall is recorded too, so a level that has fired can fire
again after the context comes back up.

Every measuring run records the transcript it read, whether or not it injected
anything and whether or not the model has a row that measures it. That record
is how the `cut-point` skill finds the transcript to read, so the skill works
from the session's first tool call onwards; in a session these hooks have never
run in, it says so rather than guessing at a file name.

The reading it prints lists three prompts and not every cached one, because
everything newer than the oldest cached prompt is cached too and a busy hour
would otherwise be dozens of interchangeable rows: the oldest, the newest, and
the one nearest halfway between them by size. A prompt no turn has answered
yet is left out, since a cut there keeps nothing verbatim, which is
`/compact` by another name. So is the first prompt of the context, which
summarizes nothing away. Where the session was compacted within the cache
lifetime and kept prompts verbatim, the reading names them instead, since a
rewind at one of them costs at most the context the compaction left behind.

The payback on each row is what turns two token counts into a decision: a
rewind writes everything it keeps back to the cache at twice a fresh input
token on the one-hour lifetime, where carrying on would have read that same
stretch at the cache read rate, and only then starts saving that read on every
turn after it. So a cut in a session with little work left in it costs more
than it ever returns.

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

That line is said once per session. The class it was said for is listed in the
session's record, `<session id>.json` under `claude-context-budget/` in the OS
temp directory. Delete that file to hear it again.

Deleting it is also how you make the current level fire again after editing a
message. It clears the resume answers the session has spent along with it, and
leaves the `cut-point` skill with no transcript to read until the next tool
call writes a new record.

`/context-budget:cut-point` prints "No measurement recorded for this
session" when these hooks have not run in it, which is an unconfigured plugin
or a session started before it was installed, or when the script was run by
hand without `--session`. Pass `--transcript <path to the session's .jsonl>` to
read one directly.

A pricing file that cannot be read, parsed or used is dropped whole and every
payback is figured at the shipped rates, with nothing said about it. An edit
to it that changes no figure is the sign to look at the file.

On Node older than 22.6 with no bun on `PATH`, the hooks print one line naming
the floor and the version they found, and do nothing.

A run killed while it held the record's lock leaves the directory `<session
id>.lock` beside the record, and the next run of the session takes it over:
the lock names the run that made it, and a process the OS no longer knows is
the proof that nobody is coming back for it. A lock whose holder is still a
running process is never taken over, whether the run is hung rather than dead
or the machine has since handed its pid to something else. While it stands,
every later run of the session skips its own update of the file without a
word: the notice never fires again, and a resume answer is never marked spent.
Deleting `<session id>.lock` is what clears it.

## Contributing

See the developer section of the [repository
README](https://github.com/stumblinbear/den#developing).
