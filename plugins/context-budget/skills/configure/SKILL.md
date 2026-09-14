---
name: configure
description: How the context-budget plugin works and how its configuration file is edited.
when_to_use: ALWAYS invoke this skill when the user asks how the context-budget plugin works, why a context notice did or did not appear, why resuming a subagent was denied, why the watcher advised what it did, why a cache wake message arrived or did not, or wants to change when any of them fires, a threshold, a per-model row, the watcher's model, the guard's limits or the wording of any message. Do not edit the plugin's config.toml or explain its behavior from memory; use this skill first.
---

# Configuring context-budget

The data directory as it stands:

!`for f in config.toml; do test -f "${CLAUDE_PLUGIN_DATA}/$f" && echo "$f: present" || echo "$f: absent"; done; test -f "${CLAUDE_PLUGIN_DATA}/.runtime" && echo ".runtime: $(cat "${CLAUDE_PLUGIN_DATA}/.runtime")" || echo ".runtime: absent, so bun when found and node otherwise"`

No `config.toml` means nothing is measured or guarded.

## Running it at all

The hooks need **Node 22.6 or newer**, and run under bun instead when `bun
--version` answers on `PATH`. On an older Node with no bun, the user is shown
one line naming the floor and the version it found, and nothing is injected or
guarded.

A file named `.runtime` in the data directory forces the choice for this
plugin. It holds one word:

```sh
echo node > "${CLAUDE_PLUGIN_DATA}/.runtime"
```

`bun` and `node` are the two it takes; no file is the default above. `bun` on
a machine with no bun on `PATH`, or any other word, is one line to the user
naming the file, and a hook run that does nothing.

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
  sits below the 450K urgent threshold and auto-compact would always win.
- Auto-compact is Claude Code's own mechanism and runs regardless of this
  plugin; the plugin only tries to get a recommendation made before it does.
- The per-session record is `<os temp dir>/claude-context-budget/<session id>.json`,
  the only file a session leaves there beside the wake's lock directory while
  an idle stretch is waited out. It holds the level the session stands at, the
  resume answers it has spent, and where the watcher's pace stands, each
  written by the hook that changes it, so a session that never crosses a
  threshold may have none. That level falls again with the context, so each
  level can fire on the next climb. No history. Deleting it makes the current
  level fire again, which is the quickest way to see a message after editing
  it.
- One line starting `context-budget:` goes into the agent's context, with an
  instruction to put it to the user, and says what is off and why: `parser
  error` is a missing `smol-toml` in the plugin's cache directory and `config
  error` names the file that cannot be read, parsed, or used, and either of
  those switches the notice, the watcher, the resume guard and the cache wake
  off together, since all four read that file through that parser. `internal
  error` is a failure of the plugin's own with nothing in the configuration to
  fix, and it
  stops only the hook that met it, which is the one its line names. Fixing it
  takes effect on the next hook run. Every turn the fault stands, a run puts the
  line up again, and once a turn: the measurement hook says it on the user's
  prompt rather than on the tool calls it also runs on, the watcher at the end
  of a turn, the guard on the resume it could not judge. Nothing is written down
  between runs, so the reports stop on the run that finds the fault gone, and a
  fault of the same kind in different words arrives in the new words.

Each message says how large the session is and when to recommend `/compact`:
at the end of the arc for `notice`, at the end of the step in hand for
`urgent`. The hook reads only the fixed 512 KB tail it measures, on every run,
and walks nothing.

The resume guard runs on every `SendMessage` the main session sends a subagent
of its own. It reads that subagent's own transcript, beside the session
transcript under `subagents/`: its newest assistant turn for the context size
and when it last ran, and the newest turn that wrote to the prompt cache for
which lifetime that cache is on. A turn served entirely from the cache writes
nothing and records no lifetime, so reading only the newest turn would make
every such subagent look cold five minutes after it stopped. The resume is
refused when the context is above `large`, or above `cold` with that cache
lifetime already elapsed, and the refusal tells the agent to put the numbers
to the user through AskUserQuestion with an option labeled "Resume". The retry
is allowed only when the user's newest answer in the session transcript picked
that option: the guard reads the answer itself, so nothing the agent claims
can stand in for it. One answer approves one resume, whose uuid is then in the
session record above; a second retry on the same answer is refused with the
`used` message.

Which `large` and `cold` those are is settled per resume, from rows under the
guard's own section:

```toml
[resume-guard]
large = 300_000
cold = 200_000

[resume-guard.agents.'den:reviewer']
large = 150_000
cold = 100_000

[resume-guard.models.'fable']
large = 600_000
cold = 400_000

[resume-guard.models.'haiku']
enabled = false
```

The first `[resume-guard.agents]` row whose key matches the agent's type
governs; failing that, the first `[resume-guard.models]` row whose key matches
the model the subagent's newest turn names; failing that, the section's own
numbers. The agent type comes first because it is the more specific fact about
a resume. Keys are regular expressions matched the way the `[models]` rows
above are, the first row written wins, and an agent key matches with the plugin
prefix in place, so the shipped row is keyed `'den:reviewer'` and a
subagent with no type recorded is `subagent`. A row carries both limits, or
`enabled = false` and neither; a row switched off is the answer for what it
matches rather than a reason to look on. The section's own `enabled = false`
switches the whole guard off, rows included, so a file that wants the rows
alone gives the section limits no resume reaches. A subagent whose newest turn
names no model skips the model rows whole, a key like `'.*'` included. Both
tables may be left out, and a configuration written before they existed keeps
the guard it had.

The watcher runs on `Stop`, in the background, and only while the context sits
past `notice` and under `urgent`. It asks a small model, on the last sixteen
turns of conversation alone, one thing: whether the session's arc of work has
just ended. Claude Code hands the answer to the agent on its next turn, and
the agent then judges whether this is a good point to compact and puts it to
the user every time, saying so where it would rather finish the work in hand
first and raising it again at each pause after, until the user compacts or
says they want none. The judge never names a command; that is the session's.
It paces itself: an answer of "not yet" names a wait of one, three or eight
turns, halved past the midpoint between the two thresholds, and a commit, a
push or a task marked completed cuts a wait short. Turns there are the user's
own prompts, so an agent woken again inside one turn runs no wait down. A
`command` of your own is handed the prompt on stdin and writes one JSON object
on stdout, bare or in the `result` field of a `claude --output-format json`
envelope; anything else reads as no verdict and costs the session nothing. A
command that will not start, and a `claude` call that comes back marked
`is_error`, are each one `internal error` line on every turn that tries the
judge, at the same pace.

The default command asks under a JSON Schema of the two answer shapes, so the
CLI samples the model against it and hands back the object it validated in the
envelope's `structured_output`, which is read before anything in the text. It
also runs the judge under safe mode, so nothing the user or the project has
configured loads inside it, these hooks included, and under a one-sentence
system prompt of the plugin's own, so nothing of the project reaches the judge
but what the prompt carries. A `command` of your own replaces that list whole,
schema and all, which is why the reading of the text above outlives it.

The cache wake runs at the end of every turn in the main session, and only
while background work is pending: a subagent launched, a command started in
the background, a workflow, or a finished agent resumed. It reads the
transcript for the newest turn's time and cache lifetime and takes the
`[wake]` row for that lifetime. The first run of an idle stretch holds
`<session id>.wake.lock` beside the record above and waits, re-reading the
transcript at each check, until `before` ahead of the cache's expiry, then
posts one message into the session's own inbox, which arrives as
`Message from @context-budget: Cache wake 1 of 2: ...` and needs no reply.
A row's `times` is how many wakes one stretch spends; the count starts over
on a turn the user or a finishing task causes, and a wake's own reply is not
one. A spent run holds the lock until the cache expires, so a lock held for
up to an hour under a live process is the wake waiting, not a lock stuck.
A session with no inbox, a Claude Code before cross-session messaging or a
`--bare` session, gets no wake and no line about it; with
`crossSessionInbound = "refuse"` the inbox stays bound, so one wake per stretch
is posted and dropped and the cache goes cold. A waiting run reads the
configuration again at each check, so a `[wake]` edit reaches it within
minutes. No message arrives when nothing is pending, since a foreground tool
call is not background work; when the lifetime's row is `enabled = false`; or
when the cache had expired before the run began. On the 5m row a single tool
call longer than about four minutes reads as idle and gets one wake, which
the session reads between tool calls when the tool returns, inside the turn.

## Where changes go

Every hook reads one file and only one:

    ${CLAUDE_PLUGIN_DATA}/config.toml

That directory survives plugin updates.

`../../hooks/config.example.toml` from this file is an example to copy there,
documenting every key. The hooks never read it, and a plugin update replaces
it, so the copy is where edits go:

    cp <plugin root>/hooks/config.example.toml \
      "${CLAUDE_PLUGIN_DATA}/config.toml"

It is read on every hook run, so an edit takes effect on the next tool call
with no reload.

Nothing is merged under it, so it carries every key without a default, and a
missing one is a `config error` naming the section and the key. Read the
Configuration section of `../../README.md` before writing an edit: it is the
table of every key, its type and its default, along with how a row key is
matched and what each message substitutes.

## Checking a change

A TOML typo, a missing key, or a value no hook can use is not quietly
dropped: it switches all of them off while it stands and says so to the agent,
on every turn it goes on standing through. Run a hook by hand from the plugin
root against a real transcript to see what it will inject, or what it objects
to:

    printf '%s' '{"session_id":"check","transcript_path":"<a .jsonl under ~/.claude/projects/>","hook_event_name":"UserPromptSubmit"}' \
      | node lib/shared/launch.mjs --data "${CLAUDE_PLUGIN_DATA}" \
        hooks/context-budget --config "${CLAUDE_PLUGIN_DATA}/config.toml"

Output is the injection JSON, the report of whatever it objects to in the same
shape, or nothing when the transcript is below the first threshold. Delete
`claude-context-budget/check.json` from the temp directory afterwards.

The guard takes a `SendMessage` input naming a subagent of that transcript,
one with an `agent-<name>.jsonl` under the transcript's `subagents/` directory:

    printf '%s' '{"session_id":"check","transcript_path":"<the .jsonl>","hook_event_name":"PreToolUse","tool_name":"SendMessage","tool_input":{"to":"<name>"}}' \
      | node lib/shared/launch.mjs --data "${CLAUDE_PLUGIN_DATA}" \
        hooks/resume-guard --config "${CLAUDE_PLUGIN_DATA}/config.toml"

Output is the deny JSON with the filled message, or nothing when the resume
is allowed.
