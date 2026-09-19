# context-budget

A Claude Code plugin that gets the agent to recommend `/compact` at the end of
an arc of work, while the moment is still a good one, instead of letting
auto-compact choose one for you.

## What it provides

- A context notice. After every tool call and every prompt in the main
  session, a hook measures how full the context is and injects a message the
  first time it crosses each of two thresholds. The first asks the agent to
  recommend `/compact` at the end of the arc in hand. The second asks for it at
  the end of the step in hand instead.
- A watcher. Past the first threshold, at the end of every turn, a background
  hook asks a small model one thing: whether the session's arc of work has just
  ended. Its answer reaches the agent on the next turn as advice: where the
  boundary was and why the arc looks over. Where `/compact` is the next command
  you should run, the agent tells you so in one sentence, with the command on a
  line of its own; otherwise it says nothing about compaction and carries on,
  and the watcher asks again after the next commit, push or completed task, or
  once the context passes halfway to the second threshold.
  It runs on your own Claude subscription's allowance, a few calls in a session;
  `[watcher] enabled = false` switches it off.
- A resume guard. Before a message is sent to a subagent, a hook denies
  resuming one whose context is large, or whose prompt cache has expired, and
  tells the agent to put the numbers to you first. A fresh launch is never
  blocked, and neither is a message to an agent still running.
- A cache wake. A session idle on background work stops reading its prompt
  cache, and once the lifetime runs out the next turn rewrites the whole
  context at full price. Shortly before that expiry, a hook left running from
  the end of the last turn posts a short message into the session's own inbox.
  The session takes one short turn on it, reads its context back at the cached
  rate, and the cache lives another lifetime. Two wakes an idle stretch on the
  hour lifetime and five on the five-minute one, and only while background work
  is pending. `[wake] enabled = false` switches it off.
- The `configure` skill (`/context-budget:configure`): the guided path through
  the configuration and through "why did it do that".

Two things reach you directly: a cache wake's preview line, and the one line a
launcher writes when it cannot start a hook. Everything else arrives as the
agent's recommendation.

## Requirements and what it does on your machine

The hooks are TypeScript and run with no build step. Claude Code starts them
with `node`, so **Node 22.6 or newer** is the floor. They run under bun
instead whenever `bun` is on `PATH`.

A file named `.runtime` in the plugin's data directory forces the choice for
this plugin. It holds one word, `bun` or `node`:

```sh
echo node > ~/.claude/plugins/data/context-budget-den/.runtime
```

No file is the default above. Anything else shows you one line naming the
file, and the hook run does nothing.

TOML has no parser in Node, so the hooks depend on `smol-toml`. Claude Code
installs it when it caches the plugin. There is nothing to build and nothing
to run by hand.

The wake needs cross-session messaging, which by [Claude Code's own
page](https://code.claude.com/docs/en/cross-session-messaging) is 2.1.224 or
newer on macOS, Linux and WSL 2, 2.1.234 on native Windows, and 2.1.248 on
Bedrock and the other non-Anthropic providers and in a session with
feature-flag fetching off; an older Claude Code binds no inbox and the wake
stays silent in it. The one-line preview an arriving wake shows up as is 2.1.247 and newer;
below that the whole message shows, body and all. The frame the wake writes
into that inbox is undocumented, the one Claude Code 2.1.269 accepts from a
hook of its own, so a release can change it under the plugin: a wake that stops
arriving after an update is the first place to look.

What it sends off the machine: the watcher runs `claude -p` at the end of a
turn, and only while the context sits between the two thresholds. That run gets
your recent prompts, the agent's replies with every tool result stripped out,
the names of the tools it called, and the token figures below. It goes to the
model named by `[watcher] model`, `haiku`, on your own subscription and out of
that subscription's allowance; the judge paces itself, so a session sees a
handful of calls. It runs with the built-in tools switched off, so it can
answer and nothing else, and under safe mode, so nothing you or the project has
configured loads inside it: no CLAUDE.md, no plugins, no skills, no hooks, no
MCP servers. Its system prompt is one sentence of the plugin's own in place of
Claude Code's, so nothing of your project reaches it beyond what the prompt
above carries: not the directory, not the branch, not what has changed there.
`enabled = false` under `[watcher]` stops it, and nothing is sent. The wake
sends nothing of its own: its message goes over the local socket Claude Code
binds for the session. What it costs is the turn it wakes, one turn on the
session's own model, your whole context read back from the cache and a short
reply. What it saves is the full-price rewrite of that context on the first
turn after the cache goes cold. Nothing else here leaves your machine.

What is read: every hook reads your configuration file in the data directory, on
every run. The notice hook reads the last 512 KB of the session transcript,
after every tool call and every prompt. The guard reads, on every message to a
subagent, that subagent's whole transcript and its metadata file. For a message
that names the agent by name it reads the metadata file of every subagent of
the session, and where several carry that name, the session transcript backward
to the newest record of one of them. Only when that subagent is past one of the
limits does it read the session transcript again: backward to the newest entry
that names the agent, for whether it is still running, and then, for one that
has stopped, the whole of it, for your latest answer. The watcher reads the
same 512 KB tail at the end of a turn and, past the first threshold, the
transcript backward to the last compaction, for the turn that has just ended
and a count of your prompts behind it; only when it is about to ask the judge
does it read the last sixteen turns. The wake reads the transcript backward to
the last compaction at the end of every turn in the main session, for the
background work still running and the newest turn's time and cache lifetime,
and reads it again at every check while it waits out an idle stretch. Nothing
here reads your source.

What is written: one JSON file per session under `claude-context-budget/` in the
OS temp directory, holding the level this session has been told about, the
resume answers it has spent, where the watcher's pace stands and the verdict
standing, plus a lock directory beside it while a hook is writing, and a second
one for the moment a run spends taking over a lock left by a run that died. A
wake waiting out an idle stretch holds a lock directory of its own beside the
record, `<session id>.wake.lock`, for as long as the stretch lasts. Nothing is
written to your project.

What they can do to a session: add a message to the agent's context, deny a
`SendMessage` to a subagent, start one short `claude -p` run at the end of a
turn, and post a message into the session's own inbox, which an idle session
takes as a turn and a busy one reads between tool calls. The wake's run
outlives the turn that started it. It waits the idle stretch out, up to one
cache lifetime past the last wake it posted, and it survives the session's own
exit, ending by itself no later than one lifetime after the session's last
turn.

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

Nothing else is needed. When a session passes 250K tokens, the agent finishes
what it is doing and then tells you it recommends `/compact`. To see it sooner,
lower `notice` under `[default]`.

## Configuration

Every hook reads one file and only one:

    ~/.claude/plugins/data/context-budget-den/config.toml

`hooks/config.example.toml` is the starting point, documented key by key. The
hooks never read it, so a plugin update cannot change what a configured
session runs on. `/context-budget:configure` is the guided path through an
edit.

The file is read on every hook run, so an edit takes effect on the next tool
call with no reload, and a run waiting an idle stretch out reads it again at
each of its checks, so a `[wake]` edit reaches that run at its next check, a
few minutes away at most. Nothing is merged under it, so it carries every key
below that has no default. A missing key is a config error naming it.

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
| `[watcher] command` | list | the `claude -p` line the example spells out, `--tools ""`, `--safe-mode`, `--system-prompt` and `--json-schema` included | the judge invocation, as an argument list rather than a shell line; replace it whole to run the judge on something else, schema and all |
| `[watcher] tail_turns` | count | `16` | how many recent turns the judge is shown |
| `[watcher] tail_tokens` | count | `20000` | how much of those turns it is shown, cut from the oldest end |
| `[wake] enabled` | bool | `true` | `false` switches the wake off: nothing is posted, a run already waiting ends at its next check, and an idle session goes cold as it would without the plugin |
| `[wake.'1h'] enabled` | bool | `true` | `false` leaves a session on the hour lifetime to go cold |
| `[wake.'1h'] times` | count | `2` | how many wakes one idle stretch spends there before the cache is left to expire |
| `[wake.'1h'] before` | duration | `"3m"` | how far ahead of the expiry a wake is posted; a lead not shorter than the lifetime is a config error |
| `[wake.'5m'] enabled` | bool | `true` | `false` leaves a session on the five-minute lifetime to go cold |
| `[wake.'5m'] times` | count | `5` | the same count, for that lifetime |
| `[wake.'5m'] before` | duration | `"45s"` | the same lead, under the same rule |
| `[wake.messages] wake` | string | the instruction the example spells out | the body of the wake, under a first line the plugin writes |

`[models]`, the guard's two tables of rows, `[watcher]` and `[wake]` may each be
left out altogether: every key under those last two has the default above, so a
file written before either existed keeps working and gains it, and a file
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
read is worth what no answer is worth. The failures you hear about are a
command whose first word nothing can start, and a `claude` call that came back
marked `is_error`, which is a judge that failed rather than answered.

Row keys are regular expressions in single quotes, matched against the model
id as the transcript records it: `claude-opus-5`, `claude-fable-5-1`,
`claude-haiku-4-5-20251001`. Rows are tried in the order they are written and
the first match wins, so a general row above a specific one hides it.

The guard's two tables are read the same way, one after the other:
`[resume-guard.agents]` first, keyed on the resumed agent's type with its
plugin prefix in place, so the shipped row is keyed `'den:reviewer'` and a
subagent whose metadata records no type is `subagent`; then
`[resume-guard.models]`, keyed on the model that subagent's newest turn names;
then the `[resume-guard]` numbers. The type comes first because it is the more
specific fact about a resume. The first row that matches is the answer, a row
switched off included: that row allows the resume rather than sending the
lookup on to the next table. `enabled = false` on the section itself switches
all of it off, rows and all; for the rows alone, give the section limits no
resume of yours reaches.

The wake's two lifetime keys are read as written and not as regular
expressions: `'1h'`, the cache lifetime a subscription within its plan's usage
gets, and `'5m'`, the one usage credits and an API key get. A table under any
other key is never consulted. Both rows are read whether or not `[wake]
enabled` is true, so a mistake in a row nothing is using still reaches you. A
`before` is written as hours, minutes and seconds, `"45s"`, `"3m"` or
`"1h30m"`; one as long as its lifetime falls due before the turn it counts
from, which is why it is a config error rather than a wake that never comes.

All five messages are read by the agent, not by you, so they are written as
instructions. `[messages]` substitutes `{model}`, `{tokens}` and
`{threshold}`. `[resume-guard.messages]` substitutes `{agent}`, `{type}`,
`{model}`, `{tokens}`, `{reasons}`, `{large}` and `{cold}`, the last two from
whichever row or section governed that resume. `{model}` reads "no recorded
model" where the subagent's newest turn names none. `[wake.messages] wake`
substitutes `{n}`, this wake's number within the stretch, `{times}`, the row's
count, and `{pending}`, how many background tasks are still running.

## Operation and limitations

The measurement is the newest assistant turn in the transcript: its prompt,
cache-creation and cache-read tokens added together. So the number is one turn
old, and the notice lands after the reply that crossed the line.

Thresholds are absolute token counts, not fractions of a context window. The
hook cannot see the window size. The example's `[default]` pair is the catch-all
for a model with no `[models]` row, set against the 1M window every current
model carries.

Subagents are never measured, and the notice is never injected into one.

A compaction resets the measurement. `/compact`, auto-compact and both rewind
summarize directions leave a boundary in the transcript, and a scan that
reaches one before any assistant turn reports a compaction rather than a
measurement: the session is put back to no level at all, whatever governs the
model, and the next turn is measured against the thresholds afresh. Only a
rise injects, but a fall is recorded too, so a level that has fired can fire
again after the context comes back up.

The watcher paces itself, and the judge sets the pace. Past the notice
threshold and under the urgent one it is asked whether the session has just
reached the end of an arc, and an answer of "not yet" says when to ask again: the
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
below the 450K urgent threshold and auto-compact would always win.

Auto-compact is Claude Code's own mechanism and runs regardless of this
plugin. All the plugin does is try to get a recommendation made first.

The resume guard only applies to a subagent of the current session that has
already spoken, found by its transcript under the session transcript's
`subagents/` directory. A message may name the agent by its id or by its name.
A name is looked up in the metadata files there, and where several agents carry
one name, a skill forked twice for instance, the guard measures the one the
session transcript shows was started last, which is where Claude Code has been
seen to deliver. A message to an agent still running in the background passes
whatever its size. It restarts nothing: the agent takes the message on its next
turn, and that turn re-reads the context, cold cache included, with or without
a message waiting. Running is what it is to the wake below, a launch or a
resume with neither a task notification nor a stop of that task after it,
except that the guard reads past compactions, which end no agent. The limits it
holds a resume to come from the resume itself: the first
`[resume-guard.agents]` row matching the agent's type, then the first
`[resume-guard.models]` row matching the model its newest turn names, then the
`[resume-guard]` numbers. A subagent whose newest turn names no model skips the
model rows whole rather than falling into a key like `'.*'` written there. A
denied resume is approved by your answer and nothing else: the guard reads the
session transcript for your newest AskUserQuestion answer and allows the retry
only when the option you picked was labeled "Resume". One answer approves one
resume; a second attempt on the same answer is denied with the `used` message.
A `denied` message rewritten to stop asking for a "Resume" option breaks the
retry, since that label is what the guard looks for.

The wake runs in the main session only, never in a subagent, and only while
background work is pending. Pending work is a launch the transcript carries
with nothing closing it afterwards, neither a task notification nor a stop of
that task: an agent sent to the background, a skill forked into one, a Bash
command started there, a workflow, or a finished agent resumed with a message.
The read stops at the last compaction, so a launch older than one counts for
nothing.

Each idle stretch spends its own count, `times` wakes on the row for the
lifetime in force. The count is spent against the last real turn, one of your
prompts or a notification that background work finished, so anything you do
starts it over and a wake's own reply does not. A run whose count is spent goes
on waiting until the cache expires rather than exiting: the reply to its last
wake ends a turn, Claude Code fires Stop on it, and a run that let the stretch
go there would hand a fresh count to that Stop's own run. The later Stop finds
the lock held and exits at once.

You see a wake as one preview line, `Message from @context-budget: Cache wake 1
of 2: 3 background tasks still running.`, and a session started with
`--verbose` shows the whole message instead. The body under it is the agent's,
an instruction to give you a short progress update. No reply is needed, and
none arrives.

A session that binds no inbox gets no wake and no line about it: the wake has
nowhere to post, and a Claude Code without cross-session messaging is not a
broken plugin. `crossSessionInbound` is a different thing. The inbox stays
bound under every value of it, so the wake posts as it always does, and the
setting decides what happens to the message: `accept` delivers it, `hold` shows
you a notice instead of delivering it, and `refuse` drops it. Under either of
those last two the session takes no turn on the wake, so the wake is spent, the
cache goes cold, and the run holds its lock until the expiry it was waiting
for. With no value set, Claude Code delivers a message it can verify came from
the session's own child process and holds one it cannot, and the wake sends
the line that verifies it, so it arrives even in a session running with
permissions bypassed, where any other peer's message waits for your approval.

A busy session is not read as busy. The wake measures from the newest turn, so
on the five-minute lifetime it falls due 4m15s after that turn, and a single
foreground tool call running longer than that, with background work pending
behind it, reads as an idle session and gets one wake posted into it. Claude
reads that one between tool calls when the tool returns, inside the turn it is
already in, rather than taking a turn on it. It takes a run left waiting by an
earlier turn's Stop to reach that far, since the hook starts on Stop and
nowhere else. The hour lifetime has the same shape at 57 minutes.

## Troubleshooting

A configuration the hooks cannot use switches the notice, the watcher, the
resume guard and the cache wake off while it stands, and puts one line starting
`context-budget:` into Claude's context, asking it to pass the line on to you.
`config error` names the file and what is wrong with it; `parser error` means
`smol-toml` is missing from the plugin's cache directory. Every run still reads
the file, so a fix takes effect on the next tool call.

`internal error` is the third of them, and usually it is not yours to fix: the
run stopped on something the plugin does not account for, and the line ends in
where to report it. It names only what stopped, one of the four, because that
is all an error of one hook's own costs: the other three keep working through
it. The watcher's judge is the exception. A `command` nothing can start and a
call that came back an error are both listed under this class, and their lines
name the key to change rather than where to report a bug. The wake's line reads
`The cache wake is off for this session`, and only its first check of a stretch
can put one up: once the run is waiting, a failure ends the stretch in silence,
since the line would land on a turn an hour later, about something else.

A run puts the line up for as long as the fault stands, and the turn you fix it
is the turn the line stops going up. Claude is asked to pass it on, and to say
it again when the wording changes, so a fault you leave standing is one you hear
about once. Nothing is written down between runs, so there is no repeat to
switch off and no record to clear. A plugin has nowhere to put a light saying it
is off, and a context nobody is measuring goes on growing by the turn.

Once a turn, not once a tool call. The measurement hook runs on both and speaks
on your prompt, since twenty copies of one line inside a turn is a line nobody
reads; the watcher speaks at the end of a turn, and the guard on the resume it
could not judge.

Fix what the line named, leave a second mistake behind it, and the next run
says the new line. A `config error` in other words is another fault rather than
the one you have already dealt with.

Deleting the session's record, `<session id>.json` under
`claude-context-budget/` in the OS temp directory, is how you make the current
level fire again after editing a message. It clears the resume answers the
session has spent along with it.

The watcher's failures are quiet but for two. A judge that answers nothing
inside its three minutes, and one whose answer will not parse, both read as no
verdict, and the watcher takes its longest wait before asking again. What you
hear about is a `command` whose first word nothing can start, and a judge that
ran and failed, because a watcher that never answers looks exactly like a
watcher with nothing to say. Each is one `internal error` line naming the
command and what went wrong with it, and every turn that tries the judge puts
that line up again. Those tries are paced the way any other answer is, so one
comes when the wait runs out or when a commit cuts it short, rather than at the
end of every turn. The notice and the resume guard go on working through it, and
only the watcher is off.

No wake, and no line about it, points at one of these, in the order the run
meets them. The session binds no inbox, which is a Claude Code older than the
versions above, a `--bare` session, or an inbox Claude Code could not bind, the
last of which `/status` shows as `unavailable` in its `Peer address` row.
Nothing is pending, and a foreground tool call is not pending work. The row for
the lifetime in force is switched off. Or the cache had already passed its
expiry when the run began, where a wake would rebuild the whole context rather
than keep it.

A wake that posts and never arrives is `crossSessionInbound`, which here is the
session's own setting: `refuse` drops the message, and `hold` shows you a
notice for it and delivers nothing. Both leave the cache to expire.

On Node older than 22.6 with no bun on `PATH`, the hooks show you one line
naming the floor and the version they found, and do nothing.

A run killed while it held the record's lock leaves the directory `<session
id>.lock` beside the record, and the next run of the session takes it over:
the lock names the run that made it, and a process the OS no longer knows is
the proof that nobody is coming back for it. A lock whose holder is still a
running process is never taken over, whether the run is hung rather than dead
or the machine has since handed its pid to something else. While it stands,
every later run of the session skips its own update of the file without a
word: the notice never fires again, and a resume answer is never marked spent.
Deleting `<session id>.lock` is what clears it.

A `<session id>.wake.lock` under a live process is the wake waiting an idle
stretch out rather than a lock nobody released. It is held for the whole
stretch, hours where the session stays idle with work pending, and every later
Stop of that session is meant to find it held. One left behind by a run that
died is taken over on the same proof as the record's lock.

## Contributing

See the developer section of the [repository
README](https://github.com/stumblinbear/den#developing).
