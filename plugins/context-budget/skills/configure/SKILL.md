---
name: configure
description: Use when the user asks how the context-budget plugin works, why a context notice did or did not appear, why resuming a subagent was denied, or wants to change when either fires — thresholds, per-model rows, switching a model off, the resume guard's limits, or the wording of any of the messages.
---

# Configuring context-budget

## What fires and when

A hook runs after every tool call and every prompt in the main session. It
reads the newest assistant turn from the session transcript and sums that
turn's prompt, cache-creation and cache-read tokens: the size of the context
the model was last sent. Against that number it holds two levels, `notice`
and `urgent`, and injects the matching message into the agent's context the
first time each is crossed. A compaction or rewind summarize takes the level
back to none, and a level re-arms whenever the context falls back below it.

Consequences that answer most "why did it" questions:

- The number is one turn old. The notice lands after the reply that crossed
  the line, and a fresh session reads as empty until its first reply.
- Subagents are never measured; only the main session is.
- Haiku is switched off in the shipped config, because its 200K window sits
  below the 250K urgent threshold and auto-compact would always win.
- Auto-compact is Claude Code's own mechanism and runs regardless of this
  plugin; the plugin only tries to get a recommendation made before it does.
- The per-session record is `<os temp dir>/claude-context-budget/<session id>.json`,
  and it is the only file a session leaves there. Every run that measures
  anything rewrites it: the transcript path the hook read, the model id, the
  token count, the time, the highest level it has injected so far — which falls
  again with the context so each level can fire on the next climb — and any
  fault already reported (below). Latest reading only, no history. Deleting it
  makes the current level fire again, which is the quickest way to see a message
  after editing it. It is written even for a model whose row is switched off,
  and even when nothing was near a threshold, because the `cut-point` skill has
  only the session id to find the transcript by.
- One stderr line starting `context-budget:` means both the notice and the
  resume guard are off, and says why: `parser error` is a missing `smol-toml`
  in the plugin's cache directory, `config error` names the file that cannot
  be read, parsed, or used. Nothing is measured and nothing is guarded until
  it is fixed; fixing it takes effect on the next hook run. Each kind of fault
  is said once per session, listed in the record above once it has been —
  delete the record to hear it again.

Each injected message also carries a snapshot of the prompt cache, substituted
into it as `{cache}`. A rewind at a prompt re-reads everything before that
prompt, and that prefix is in the cache only while the prompt itself is younger
than the cache lifetime — so the snapshot lists three cached prompts spread
across the context, the oldest, the newest and the one nearest halfway between
them by size, each a row carrying when it stops being cached, how much a cut
there summarizes away and how much it keeps verbatim, and what sits above them.
Where
the session was compacted and kept prompts verbatim, the reading names them,
since a rewind at one of them costs at most the context the compaction left
behind. It is taken by walking the transcript
backward from its end, only on
the run that injects; the per-tool-call runs that measure and stay quiet read a
fixed 512 KB tail as before, and never walk anything.

Two consequences:

- The snapshot goes stale. The notice message tells the agent to carry on with
  its task and raise the recommendation later, and the prompt it named may have
  fallen out of the cache by then — the messages tell it to say the expiry out
  loud and to take a fresh reading if the stopping point comes too late.
- A fresh reading is the `cut-point` skill, `/context-budget:cut-point`. It
  runs the same scan over the same transcript through the same renderer, so
  what it prints is identical to the snapshot in the message, only current —
  which is also what the user gets by asking for another cut point after the
  first one expired. It reaches that transcript through the record above, so it
  works from the session's first tool call and says so plainly in a session
  this plugin has never measured.

The resume guard is the second hook, on every `SendMessage` to a subagent of
this session. It reads that subagent's own transcript, beside the session
transcript under `subagents/`: its newest assistant turn for the context size
and when it last ran, and the newest turn that wrote to the prompt cache for
which lifetime that cache is on — a turn served entirely from the cache
writes nothing and records no lifetime, so reading only the newest turn would
make every such subagent look cold five minutes after it stopped.
The resume is refused when the context is above `large`, or above `cold` with
that cache lifetime already elapsed, and the refusal tells the agent to put the
numbers to the user through AskUserQuestion with an option labeled "Resume".
The retry is allowed only when the user's newest answer in the session
transcript picked that option: the guard reads the answer itself, so nothing
the agent claims can stand in for it. One answer approves one resume, recorded
as a marker named by the answer's uuid under `<os temp dir>/claude-resume-guard/`;
a second retry on the same answer is refused with the `used` message.

## Where changes go

The shipped config is `../../hooks/config.toml` from this file, and it
documents every key. It is replaced on every plugin update, so changes go in
the override file instead:

    ~/.claude/plugins/data/context-budget-den/config.toml

The `-den` suffix is the marketplace name the plugin was installed from. The
override holds only the keys that change, and it is read on every hook run, so
an edit takes effect on the next tool call with no reload.

Merge rules, one per section:

- `[default]` and `[messages]` merge key by key: an override with only
  `notice` keeps the shipped `urgent`.
- `[models.'<regex>']` rows are tried in order and the first match wins.
  An override row with the same key replaces the shipped row; a row with a
  new key is appended after all shipped rows. So to change a model the
  shipped file already matches, reuse its key exactly: `[models.'haiku']`
  with thresholds re-enables Haiku, while `[models.'claude-haiku']` sits
  behind the shipped `'haiku'` row and is never reached.
- `enabled = false` on a row switches the plugin off for every model that
  row matches; on `[default]` it switches off every model no row matches.
- `[resume-guard]` merges key by key, and `[resume-guard.messages]` inside
  it merges key by key of its own, so an override can replace one deny
  message and keep the other. `enabled = false` there switches the resume
  guard off: every resume is allowed, and no transcript is read.

Values:

- Thresholds are absolute token counts, not fractions of a window: the
  hook does not know the window size, and the `[1m]` suffix on a configured
  model never reaches the transcript. The shipped 150K is Anthropic's
  server-side compaction default on 1M-window models; raise or lower from
  there by how much the user is willing to spend per turn. The shipped
  `fable` row sits at 400K and 700K because that model reads a cached
  context at a quarter of the usual price while a compaction writes back what
  it keeps at double: with the 45K or so a compaction writes back, as measured
  on real sessions, one at 150K pays for itself only after about 35 more
  turns, at 400K after about 11.
- Row keys are regular expressions in single quotes, matched against the
  model id as the transcript records it: `claude-fable-5-1`,
  `claude-opus-5`, `claude-haiku-4-5-20251001`.
- All four messages are read by the agent, not the user, so write them as
  instructions with the reason attached, the way the shipped ones are. The
  notice pair substitutes `{model}`, `{tokens}`, `{threshold}` and `{cache}`;
  the guard pair substitutes `{agent}`, `{type}`, `{tokens}`, `{reasons}`,
  `{large}` and `{cold}`. `{cache}` and `{reasons}` are computed, not
  configurable — the cache snapshot and the list of limits that fired. Drop
  `{cache}` from a message and the recommendation it asks for goes back to
  being blind to what a rewind would cost. A `denied` message that stops
  asking for the "Resume" option breaks the retry, since that option's label
  is what the guard looks for.

## Checking a change

A TOML typo, or a value neither hook can use, is not quietly dropped: it
switches both of them off for the session and says so once on stderr. Run the
hook by hand from the plugin root against a real transcript to see what it will
inject, or what it objects to:

    printf '%s' '{"session_id":"check","transcript_path":"<a .jsonl under ~/.claude/projects/>","hook_event_name":"UserPromptSubmit"}' \
      | node hooks/context-budget.mjs --defaults hooks/config.toml --overrides ~/.claude/plugins/data/context-budget-den/config.toml

Output is the injection JSON, or nothing when the transcript is below the
first threshold. Delete `claude-context-budget/check.json` from the temp
directory afterwards.

The guard takes a `SendMessage` input naming a subagent of that transcript,
one with an `agent-<name>.jsonl` under the transcript's `subagents/` directory:

    printf '%s' '{"session_id":"check","transcript_path":"<the .jsonl>","hook_event_name":"PreToolUse","tool_name":"SendMessage","tool_input":{"to":"<name>"}}' \
      | node hooks/resume-guard.mjs --defaults hooks/config.toml --overrides ~/.claude/plugins/data/context-budget-den/config.toml

Output is the deny JSON with the filled message, or nothing when the resume
is allowed.

The cache snapshot inside the injected message is the cut-point script's
reading of the same transcript, the identical text, so run that on its own to
see it without a threshold in the way. By hand it takes the path:

    node scripts/cut-point.mjs --transcript "<the .jsonl>"

In a session it takes no arguments: it reads `CLAUDE_CODE_SESSION_ID` from its
own environment and the transcript path from that session's record. Output is
the lifetime, three cached cut points with their expiry and their two sizes,
and what sits above them; or a line saying nothing is cached; or, where the
session was compacted and kept prompts verbatim, the prompts it kept and the
context it left behind, since a rewind at one of them costs at most that
context; or, where there is no record, a line saying the hook has never
measured that session. The
list is three because everything newer than the oldest cached prompt is cached
too: a busy hour would otherwise print dozens of rows that all say the same
thing, so it prints the oldest, the newest and the one nearest halfway between
them by size, and one line saying the rest of the range is open as well.
