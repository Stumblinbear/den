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
- A watcher. Past the first threshold, at the end of every turn, a background
  hook asks a small model whether the session has just reached a good moment to
  compact or rewind. Its answer reaches the agent on the next turn as advice:
  where the boundary was, what it recommends with the focus line or the prompt
  to rewind to, and why. The agent may decline it. It runs on your own Claude
  subscription's allowance, a few calls in a session; `[watcher] enabled =
  false` switches it off.
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
  take before the cut has paid for what it cost. `/compact` is priced above
  them on the same arithmetic and carrying on unchanged below them, so the
  three are read against one another rather than one against two blanks.
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

What it sends off the machine: the watcher runs `claude -p` at the end of a
turn, and only while the context sits between the two thresholds. That run gets
your recent prompts, the agent's replies with every tool result stripped out,
the names of the tools it called, and the token figures below. It goes to the
model named by `[watcher] model`, `haiku`, on your own subscription and out of
that subscription's allowance; the judge paces itself, so a session sees a
handful of calls. It runs with the built-in tools switched off, so it can
answer and nothing else. It starts in the plugin's data directory rather than
in your project, so no CLAUDE.md, hook or MCP server of that project loads
inside it.
The ones you have installed at the user level do load, which is what running on
your subscription rather than on an API key costs. `enabled = false` under
`[watcher]` stops it, and nothing is sent. Nothing else here leaves your
machine.

What is read: every hook reads your configuration file in the data directory,
on every run. The notice hook reads the last 512 KB of the session transcript,
after every tool call and every prompt. The guard reads, on every message to a
subagent, that subagent's whole transcript and its metadata file, and, only
when the resume is past one of the limits, the whole session transcript, for
your latest answer. The `cut-point` skill's command reads the session
transcript backward from its end, as far back as the cached stretch goes, and
the two price files below. The watcher reads the same 512 KB tail at the end of
a turn and, past the first threshold, the transcript backward to the last
compaction, for the turn that has just ended and a count of your prompts behind
it; only when it is about to ask the judge does it read the last sixteen turns
and the same cached stretch the skill reads. Nothing here reads your source.

What is written: one JSON file per session under `claude-context-budget/` in
the OS temp directory, holding the transcript the last measuring run read, the
level this session has been told about, the resume answers it has spent, where
the watcher's pace stands and the verdict standing, and the faults the session
has been told about, plus a lock directory beside it while a hook is writing,
and a second one for the moment a run spends taking over a lock left by a run
that died. Nothing is written to your project.

What they can do to a session: add a message to the agent's context, deny a
`SendMessage` to a subagent, and start one short `claude -p` run at the end of
a turn.

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

Every hook reads one file and only one:

    ~/.claude/plugins/data/context-budget-den/config.toml

`hooks/config.example.toml` is the starting point, documented key by key. The
hooks never read it, so a plugin update cannot change what a configured
session runs on. `/context-budget:configure` is the guided path through an
edit.

The file is read on every hook run, so an edit takes effect on the next tool
call with no reload. Nothing is merged under it, so it carries every key below
that has no default. A missing key is a config error naming it.

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
| `[resume-guard] enabled` | bool | `true` | `false` switches the guard off, the rows below it included: every resume is allowed and no transcript is read |
| `[resume-guard] large` | tokens | required | the context above which a resume is denied however warm the cache, for every resume no row governs |
| `[resume-guard] cold` | tokens | required | the same once the subagent's prompt cache has expired |
| `[resume-guard.agents.'<regex>'] enabled` | bool | `true` | `false` allows every resume of an agent type the row matches, and waives its limits |
| `[resume-guard.agents.'<regex>'] large` | tokens | required | the row's `large`, for a resume of an agent type it matches |
| `[resume-guard.agents.'<regex>'] cold` | tokens | required | the row's `cold`, for the same |
| `[resume-guard.models.'<regex>'] enabled` | bool | `true` | `false` allows every resume of a subagent whose newest turn names a model the row matches |
| `[resume-guard.models.'<regex>'] large` | tokens | required | the row's `large`, for a resume on a model it matches |
| `[resume-guard.models.'<regex>'] cold` | tokens | required | the row's `cold`, for the same |
| `[resume-guard.messages] denied` | string | required | the deny reason on a first attempt |
| `[resume-guard.messages] used` | string | required | the deny reason when the user's latest answer has already been spent |
| `[watcher] enabled` | bool | `true` | `false` stops the watcher: no model call, and nothing done on Stop past reading this file |
| `[watcher] model` | string | `haiku` | the model the judge runs on, substituted into `command` wherever it writes `{model}` |
| `[watcher] command` | list | the `claude -p` line the example spells out, `--tools ""` and `--json-schema` included | the judge invocation, as an argument list rather than a shell line; replace it whole to run the judge on something else, schema and all |
| `[watcher] tail_turns` | count | `16` | how many recent turns the judge is shown |
| `[watcher] tail_tokens` | count | `20000` | how much of those turns it is shown, cut from the oldest end |

`[models]`, the guard's two tables of rows and `[watcher]` may each be left out
altogether: every key under `[watcher]` has the default above, so a file
written before the watcher existed keeps working and gains it, and a file
written before the guard's rows existed keeps the numbers it already had. The
other four tables are always read, including `[resume-guard.messages]` when the
guard is off.

The judge is handed its prompt on stdin. The default command asks for the
answer under a JSON Schema of the two shapes it may take, so the CLI samples
the model against it, validates what comes back and returns the object in the
envelope's `structured_output`, which is where the answer is read from. A
`command` of your own replaces that list whole and is handed no schema, so its
answer is read out of the text instead: one JSON object on stdout, either bare
or in the `result` field of a `claude --output-format json` envelope. An answer
that will not parse is silence: the watcher advises, so an answer nobody can
read is worth what no answer is worth. A command whose first word nothing can
start is the one failure you hear about, once, on stderr.

Row keys are regular expressions in single quotes, matched against the model
id as the transcript records it: `claude-opus-5`, `claude-fable-5-1`,
`claude-haiku-4-5-20251001`. Rows are tried in the order they are written and
the first match wins, so a general row above a specific one hides it.

The guard's two tables are read the same way, one after the other:
`[resume-guard.agents]` first, keyed on the resumed agent's type with its
plugin prefix in place, so `'flag-reviewer'` matches `den:flag-reviewer` and a
subagent whose metadata records no type is `subagent`; then
`[resume-guard.models]`, keyed on the model that subagent's newest turn names;
then the `[resume-guard]` numbers. The type comes first because it is the more
specific fact about a resume. The first row that matches is the answer, a row
switched off included: that row allows the resume rather than sending the
lookup on to the next table. `enabled = false` on the section itself switches
all of it off, rows and all; for the rows alone, give the section limits no
resume of yours reaches.

All four messages are read by the agent, not by you, so they are written as
instructions. `[messages]` substitutes `{model}`, `{tokens}` and
`{threshold}`. `[resume-guard.messages]` substitutes `{agent}`, `{type}`,
`{model}`, `{tokens}`, `{reasons}`, `{large}` and `{cold}`, the last two from
whichever row or section governed that resume. `{model}` reads "no recorded
model" where the subagent's newest turn names none.

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

Two rows sit around those cut points, on the same arithmetic, so that the
paybacks have something to be read against. `/compact` comes first, priced as
a cut at the tail Claude Code keeps rather than at a prompt anyone selects;
that tail is sized by Claude Code and never known in advance, so the row is an
estimate, taken from what this session's own compaction left behind where
there is one and from a typical 15K where there is not, and it says which.
Only a `/compact` or an auto-compact counts as one there: a rewind summarize
writes the same kind of boundary and kept the stretch the user chose, which
measures no tail, so a session whose only boundary came out of the picker
takes the 15K like a session with no boundary at all.

Carrying on comes last: the whole context read back every turn, at the cache
read rate, which is what every payback above it is measured against. The
reading prices these; it recommends none of them. Which one to take is the
`cut-point` skill's, and it weighs what the work ahead still needs verbatim
before it reads a figure at all.

The watcher paces itself, and the judge sets the pace. Past the notice
threshold and under the urgent one it is asked whether the session has just
reached a good moment, and an answer of "not yet" says when to ask again: the
next turn, three turns, or eight, halved to four once the context is past the
midpoint between the two thresholds. Turns there are your own prompts, so an
agent woken half a dozen times inside one turn by background work runs nothing
down. A commit, a push or a task marked completed cuts a wait short, since each
is the sort of thing that ends an arc. Nothing else is read as one: what an arc
is is the judge's to say, and a hook guessing it from the shape of a turn is the
design this one replaced. Past the urgent threshold the judge is never asked,
because the urgent notice has already said what a verdict there would say. One
call runs at a time, and one that has answered nothing inside three minutes is
killed.

The answer reaches the agent on its next turn, which is when Claude Code hands
over what a background hook wrote. Once the agent has heard it the watcher goes
quiet until the context climbs a rung or the work lands a commit, a push or a
completed task: the agent never reports that it declined, so a new signal is
what reopens the question. A compaction or a rewind ends it too, and so does one
that lands while the judge is still reading: the watcher notes which context
each count was taken in, and an answer or a verdict about a context the session
no longer has is dropped rather than delivered against the one it has now.

The example configuration switches Haiku off, because its 200K window sits
below the 250K urgent threshold and auto-compact would always win.

Auto-compact is Claude Code's own mechanism and runs regardless of this
plugin. All the plugin does is try to get a recommendation made first.

The resume guard only applies to a subagent of the current session that has
already spoken, found by its transcript under the session transcript's
`subagents/` directory. The limits it holds that resume to come from the resume
itself: the first `[resume-guard.agents]` row matching the agent's type, then
the first `[resume-guard.models]` row matching the model its newest turn names,
then the `[resume-guard]` numbers. A subagent whose newest turn names no model
skips the model rows whole rather than falling into a key like `'.*'` written
there. A denied resume is approved by your answer and nothing else: the guard
reads the session transcript for your newest AskUserQuestion answer and allows
the retry only when the option you picked was labeled "Resume". One answer approves one resume; a second attempt on the same answer
is denied with the `used` message. A `denied` message rewritten to stop asking
for a "Resume" option breaks the retry, since that label is what the guard
looks for.

## Troubleshooting

A configuration the hooks cannot use prints one line on stderr, starting
`context-budget:`, and switches the notice, the watcher and the guard off while
it stands. `config error` names the file and what is wrong with it;
`parser error` means `smol-toml` is missing from the plugin's cache
directory. Every run still reads the file, so a fix takes effect on the next
tool call.

`internal error` is the third of them, and usually it is not yours to fix: the
run stopped on something the plugin does not account for, and the line ends in
where to report it. It names only what stopped, one of the three, because that
is all an error of one hook's own costs: the other two go on measuring and
guarding through it. One of them is yours: a judge `command` the watcher cannot
start is listed under the same class, and that line ends in the key to correct.

You hear that line again on every tenth prompt the fault has stood through,
ending in how many prompts that is, and nothing at all in between: `Standing
for 10 prompts.`, then `Standing for 20 prompts.`, and on from there. The
prompt is what says it, whichever hook met the fault first, since what it
repeats is what the record already holds. Nothing switches the repeat off: a
plugin has nowhere to put a light saying it is off, and a context nobody is
measuring goes on growing by the turn. Every fault the session has been told
about is listed in its record, `<session id>.json` under
`claude-context-budget/` in the OS temp directory, with the line you heard and
the prompts it has stood through. Delete that file to hear the line again at
once.

Fix what the line named, leave a second mistake behind it, and the next run
says the new line and starts a fresh count. A `config error` in other words is
another fault rather than the one you are already being reminded of.

The first prompt that works again says `context-budget: the config error is
gone; on again for this session.` and drops the fault from the record, so the
same fault later is a first report rather than the middle of a count. Deleting
the file counts as fixing it, since nothing is measured or guarded without one.
A tool call takes nothing back, whatever it read: only a prompt does.

A prompt takes back only what its own run got through, which is not the same as
what it reminds you of. Every hook reads one file through one parser, so a
`config error` or a `parser error` is taken back whichever of them met it. An
`internal error` is one hook's own run coming apart, so each hook's is listed
apart from the others': the measurement hook never opens the subagent transcript
the resume guard reads, and one the guard or the watcher met stays listed for
the session, repeating every tenth prompt like the rest.

A prompt that ends early takes back less still. One from a subagent, or one
Claude Code names no transcript in, has read the configuration and done nothing
else, so it answers for the file and for none of the work behind it.

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

The watcher's failures are quiet but for one. A judge that answers nothing
inside its three minutes, and one whose answer will not parse, both read as no
verdict, and the watcher takes its longest wait before asking again. A `command`
whose first word nothing can start is the one you hear about, because a watcher
that never runs looks exactly like a watcher with nothing to say: one `internal
error` line, said once, naming the command. The notice and the resume guard go
on working through it, and only the watcher is off. Delete the session record to
see it start over.

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
