---
name: configure
description: Use when the user asks how the context-budget plugin works, why a context notice did or did not appear, why resuming a subagent was denied, or wants to change when either fires — thresholds, per-model rows, switching a model off, the resume guard's limits, or the wording of any of the messages.
---

# Configuring context-budget

The data directory as it stands:

!`for f in config.toml pricing.toml; do test -f "${CLAUDE_PLUGIN_DATA}/$f" && echo "$f: present" || echo "$f: absent"; done; test -f "${CLAUDE_PLUGIN_DATA}/.runtime" && echo ".runtime: $(cat "${CLAUDE_PLUGIN_DATA}/.runtime")" || echo ".runtime: absent, so bun when found and node otherwise"`

No `config.toml` means nothing is measured or guarded; no `pricing.toml` means
the shipped rates.

## Running it at all

The hooks need **Node 22.6 or newer**, and run under bun instead when `bun
--version` answers on `PATH`. On an older Node with no bun, one stderr line
names the floor and the version it found, and nothing is injected or guarded.

A file named `.runtime` in the data directory forces the choice for this
plugin. It holds one word:

```sh
echo node > "${CLAUDE_PLUGIN_DATA}/.runtime"
```

`bun` and `node` are the two it takes; no file is the default above. `bun` on
a machine with no bun on `PATH`, or any other word, is one stderr line naming
the file and a failed hook run.

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
- The per-session record is `<os temp dir>/claude-context-budget/<session id>.json`,
  and it is the only file a session leaves there. Every run that measures
  anything rewrites it: the transcript path the hook read, the level it stands
  at — which falls again with the context, so each level can fire on the next
  climb — the resume answers it has spent, and any fault already reported
  (below). Latest transcript only, no history. It is written even for a model
  whose row is switched off, and even when nothing was near a threshold,
  because the `cut-point` skill has only the session id to find the transcript
  by. Deleting it makes the current level fire again, which is the quickest
  way to see a message after editing it.
- One stderr line starting `context-budget:` means both the notice and the
  resume guard are off, and says why: `parser error` is a missing `smol-toml`
  in the plugin's cache directory, `config error` names the file that cannot
  be read, parsed, or used, and `internal error` is a failure of the plugin's
  own with nothing in the configuration to fix. Nothing is measured and
  nothing is guarded until it is fixed; fixing it takes effect on the next
  hook run. The line is said once per session, listed in the record above once
  it has been — delete the record to hear it again.

Neither message names a cut point. Each says how large the session is and
sends the agent to the `cut-point` skill, `/context-budget:cut-point`, for
one. That skill walks the transcript backward and prints which rewind cut
points are still cached: a rewind at a prompt re-reads everything before that
prompt, and that stretch is in the cache only while the prompt itself is
younger than the cache lifetime — so it lists three cached prompts spread
across the context, the oldest, the newest and the one nearest halfway between
them by size, each a row carrying when it stops being cached, how much a cut
there summarizes away, how much it keeps verbatim, and how many more turns the
session has to take before the cut has paid for itself; and what sits above
them. Where the session was compacted within the cache lifetime and kept
prompts verbatim, the reading names them, since a rewind at one of them costs
at most the context the compaction left behind.

The payback is what turns two token counts into a decision: the rewind writes
everything it keeps back to the cache at twice a fresh input token on the
one-hour lifetime, where carrying on would have read that same stretch at the
cache read rate, and it saves the read of what it summarized on every turn
after that — so a cut in a session with little work left in it costs more than
it ever returns. Every term is what the cut costs over carrying on, which is
the only comparison worth making. It is priced at the model's cache read rate,
which is the pricing file below and not configuration.

The reading is taken when the skill is invoked and never before: a prompt
named at the moment a threshold was crossed can be out of the cache by the
time the agent is ready to put the choice to the user, and the notice is
written to be acted on at the end of an arc rather than at once. The skill
reaches the transcript through the record above, so it works from the
session's first tool call and says so plainly in a session this plugin has
never measured. The hook itself reads only the fixed 512 KB tail it measures,
on every run, and walks nothing.

The resume guard is the second hook, on every `SendMessage` to a subagent of
this session. It reads that subagent's own transcript, beside the session
transcript under `subagents/`: its newest assistant turn for the context size
and when it last ran, and the newest turn that wrote to the prompt cache for
which lifetime that cache is on — a turn served entirely from the cache writes
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

## Where changes go

Both hooks read one file and only one:

    ${CLAUDE_PLUGIN_DATA}/config.toml

That directory survives plugin updates.

`../../hooks/config.example.toml` from this file is an example to copy there,
documenting every key. The hooks never read it, and a plugin update replaces
it, so the copy is where edits go:

    cp <plugin root>/hooks/config.example.toml \
      "${CLAUDE_PLUGIN_DATA}/config.toml"

It is read on every hook run, so an edit takes effect on the next tool call
with no reload.

Nothing is merged under it, so it carries every key both hooks read, and a
missing one is a `config error` naming the section and the key. Read the
Configuration section of `../../README.md` before writing an edit: it is the
table of every key, its type and its default, along with how a row key is
matched and what each message substitutes.

One thing is deliberately not in that file. The rate a payback figure is
priced at is not configuration — it is what the model charges — so it is a
shipped file of its own, `../../lib/pricing.toml` from here, holding what a
token read from the prompt cache costs against one fresh input token:
`default = 0.1`, which is every tier in Claude Code's own price table but one,
and the `[models]` row `'fable' = 0.025`, which is that one. Every value has
to be a number above 0 and at most 1; lower it and every cut takes
proportionally more turns to pay for itself. Only the `cut-point` script reads
it; the hook that injects the messages reads no price at all.

Correct a rate that has gone out of date in a file of the same shape at

    ${CLAUDE_PLUGIN_DATA}/pricing.toml

merged by one rule: a `[models]` row whose key matches a shipped one replaces
it where it stands, so it keeps that row's place in the order; a row with a
new key is tried after all the shipped ones; and `default` replaces `default`.
Keys are regular expressions matched against the model id the same way the
configuration's rows are, and the first row that matches wins. A transcript
whose turns name no model takes the default in both files: an id that is not
there is not a model a row was written for, and a key like `'.*'` does not
collect it.

That file is optional and almost nobody has one, so a missing one changes
nothing. One that cannot be read, parsed, or used is dropped whole and every
payback is priced at the shipped rates — unlike a config fault it costs the
session nothing else, and nothing about the reading says it happened, so an
edit that has no effect on the figures is the sign to look at the file.

## Checking a change

A TOML typo, a missing key, or a value neither hook can use is not quietly
dropped: it switches both of them off for the session and says so once on
stderr. Run a hook by hand from the plugin root against a real transcript to
see what it will inject, or what it objects to:

    printf '%s' '{"session_id":"check","transcript_path":"<a .jsonl under ~/.claude/projects/>","hook_event_name":"UserPromptSubmit"}' \
      | node lib/shared/launch.mjs --data "${CLAUDE_PLUGIN_DATA}" \
        hooks/context-budget --config "${CLAUDE_PLUGIN_DATA}/config.toml"

Output is the injection JSON, or nothing when the transcript is below the
first threshold. Delete `claude-context-budget/check.json` from the temp
directory afterwards.

The guard takes a `SendMessage` input naming a subagent of that transcript,
one with an `agent-<name>.jsonl` under the transcript's `subagents/` directory:

    printf '%s' '{"session_id":"check","transcript_path":"<the .jsonl>","hook_event_name":"PreToolUse","tool_name":"SendMessage","tool_input":{"to":"<name>"}}' \
      | node lib/shared/launch.mjs --data "${CLAUDE_PLUGIN_DATA}" \
        hooks/resume-guard --config "${CLAUDE_PLUGIN_DATA}/config.toml"

Output is the deny JSON with the filled message, or nothing when the resume
is allowed.

The cut-point script is what the messages send the agent to. It reads nothing
from the configuration, so it can be run against any transcript directly; by
hand it takes the path and the two pricing paths, since the payback figure is
priced from them:

    node lib/shared/launch.mjs --data "${CLAUDE_PLUGIN_DATA}" \
      scripts/cut-point --transcript "<the .jsonl>" \
      --pricing lib/pricing.toml \
      --pricing-overrides "${CLAUDE_PLUGIN_DATA}/pricing.toml"

In a session the skill's own preamble fills in the two pricing paths and
`--session`, which Claude Code substitutes the session id into; the script
reads the transcript path from that session's record. The model it prices
against comes out of the transcript it is reading and never out of the record,
so a reading of somebody else's transcript is priced by that transcript; where
its turns name no model at all it prices at the table's default and says so in
its opening line. Output is the lifetime, three cached cut points with their
expiry, their two sizes and their payback, and what sits above them; or a line
saying nothing is cached; or, where the session was compacted within the cache
lifetime and kept prompts verbatim, the prompts it kept and the context it
left behind; or, where there is no record, a line saying the hook has never
measured that session. It always exits 0 and always prints prose: the agent
reading it has no other way to tell what went wrong.
