# Changelog

All notable changes to the context-budget plugin are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). While the major version is
0, a minor bump may change behavior.

## [Unreleased]

### Added

- Per-agent-type and per-model rows under the resume guard,
  `[resume-guard.agents.'<regex>']` and `[resume-guard.models.'<regex>']`, each
  carrying the same `large` and `cold` the section carries, or `enabled = false`
  and no numbers to leave what it matches unguarded. Keys are regular
  expressions and the first row written wins, as under `[models]`. A resume is
  measured against the first agent row matching its agent type, then the first
  model row matching the model its newest turn names, then the section's own
  numbers; the agent type comes first because it is the more specific fact
  about a resume. Agent-type keys match with the plugin prefix in place, so
  `'flag-reviewer'` matches `den:flag-reviewer`. Both tables may be left out, so
  a configuration written before this release keeps the guard it already had,
  and `[resume-guard] enabled = false` still switches the whole guard off, rows
  included.
  One resume can be worth taking at 600K and another worth refusing at 150K,
  which one pair of numbers could not say.
- The judge is asked under a JSON Schema of the two shapes its answer may take,
  which the default `[watcher] command` carries as `--json-schema`. The CLI
  samples the model against it, validates what comes back and returns the object
  in its envelope's `structured_output`, which is read before anything in the
  text. The CLI takes that object through a tool call of its own, so the default
  command allows the judge two turns: the model often writes the answer out as
  text first, and the tool call comes in the response after it. The tolerant
  reading of the text stays behind it, because a `command` written out in full
  replaces the default list schema and all, and a judge that is not `claude` is
  handed no schema to answer under.
- `{model}` in the resume guard's two messages, the model the resumed
  subagent's newest turn names, or "no recorded model" where it names none.
  `{large}` and `{cold}` now fill from whichever row or section governed that
  resume.
### Changed

- A fault that stops the hooks goes to the agent, in the field Claude Code hands
  it, carrying an instruction to put the line to you, and arrives again on every
  turn the fault stands. It went to stderr behind a hook that exited non-zero,
  which Claude Code folds away in the transcript where nobody opens it. Nothing
  is written down between runs any more: the repeat on every tenth prompt, the
  line saying a fault is over, and the list of faults in the session's record
  are gone with the bookkeeping they needed, and the reports stop on the run
  that finds the fault gone. The measurement hook reports on your prompt rather
  than on the tool calls it also runs on, since twenty copies of one line inside
  a turn is a line nobody reads; the watcher reports at the end of every turn it
  fails on and the guard on every resume it cannot judge.
- The launcher says its own refusals on your screen: a Node under 22.6 with no
  bun on `PATH`, an unset `CLAUDE_PLUGIN_DATA`, a `.runtime` asking for a bun
  that is not there or holding any other word, and an interpreter that will not
  start. Each is one line naming what is wrong, and that hook run does nothing.
  The context notice and the resume guard carry them. The watcher runs in the
  background, where Claude Code shows you nothing at all, so a launch of its own
  that never happened stays quiet. They went to stderr behind a non-zero exit,
  which Claude Code folds away as a hook error.
- The watcher's advice tells the agent to put the recommended command to the
  user in its next reply, in a fenced block on its own line, to add its own
  caveat where the work in hand should finish first, and to raise a delayed
  cut again at each later pause until the user runs one or says they want
  none. The `context-budget` skill's section on answering a verdict is gone,
  since the line carries its own instructions.
- The default `[watcher] command` carries `--tools ""`, which is what keeps the
  judge from acting: it is a Claude Code session of its own, and a sentence of
  advice is the whole of what it is asked for.
- The judge runs under safe mode and under a one-sentence system prompt of the
  plugin's own, which the default `[watcher] command` carries as `--safe-mode`
  and `--system-prompt`. No CLAUDE.md, plugin, skill, hook or MCP server of
  yours or of the project loads inside it, this plugin's own entries included,
  and nothing of your project reaches it beyond what the prompt carries:
  Claude Code's default system prompt, which told the judge the directory it
  was started in, its git branch, the files changed there and the recent
  commit subjects, is gone with it, and with both a call loads little beyond
  the prompt. The judge's own working directory and the `CONTEXT_BUDGET_JUDGE`
  marker are gone; it is spawned where the hook stands and with the hook's
  environment.
- An `internal error` line names only the hook that met it: "The context notice
  is off for this session", "The resume guard is off for this session", or "The
  watcher is off for this session". It used to say all three were off, which is
  true of a config or parser fault, since every hook reads one file through one
  parser, and false of a hook's own run coming apart, which the other two go on
  working through. A config or parser fault keeps the line naming all three.
- The judge is started on Windows through the command interpreter named and
  handed an argument list, rather than through Node's `shell: true`, for the
  `.cmd` that an npm install puts on PATH. That option joins the arguments into
  one command line with no quoting at all, which strips every quote out of the
  schema above and hands the CLI something no JSON parser reads.
- The example configuration's resume guard sits at 300K `large` and 200K `cold`
  rather than 150K and 50K, with a `fable` model row at 600K and 400K, a
  `den:red-green-fixer` agent row at 150K and 100K, and a `haiku` model row
  switched off. Measured on this project's sessions, a fresh flag reviewer reads
  about 450K tokens more than a resumed one to finish the same pass, an
  implementer about 230K and a fixer about 70K, and refusing a resume worth
  taking costs that whole rediscovery. The old numbers refused resumes on Fable
  that were still the cheaper of the two by a wide margin.
- The example configuration's `[default]` thresholds sit at 250K `notice` and
  450K `urgent` rather than 150K and 250K. Every current model carries a 1M
  window, so the old pair fired while the session still held most of its room.
  `[default]` is the catch-all for a model with no `[models]` row, whose window
  the hook cannot see, and a model worth other numbers takes a row of its own.

### Fixed

- A judge that ran and failed is reported, as a `command` nothing can start
  already was: one `internal error` line, "the watcher's judge `claude` ran and
  failed (api_error): Claude AI usage limit reached", carrying the kind of
  failure and the sentence the call came back with. That sentence is the
  envelope's `result`, or its `errors` where there is no `result`: a call that
  ran out of turns, died inside its own execution, spent its budget or gave up
  re-asking for structured output writes what went wrong there and nowhere
  else. A failed `claude -p` call
  writes its whole envelope on stdout, so it read as a judge that answered
  nothing: the watcher booked a wait, said nothing, and went on failing every
  call in silence. `is_error` on that envelope is what the reading turns on,
  rather than the exit status or `subtype`, which a failed call leaves at
  "success". A `command` of your own is handed no schema and writes no such
  field, so an answer of its own that nothing can read is still silence rather
  than a fault.
- The fix those two lines end in says to change `[watcher] command` rather than
  to fix it, since a judge whose model refused the call is not one you put right
  by editing the key.
- The resume guard says nothing at all on a SendMessage a subagent made. Its
  deny asks Claude to put the choice to you before it retries, and its report of
  a broken config file asks whoever reads it to pass the line on; a subagent
  answers its coordinator rather than you, so both reached a reader who could do
  nothing with either. A resume you set off is guarded as it was, and your own
  turns report the same config file.

## [0.4.0] - 2026-09-06

### Added

- A watcher. Past the notice threshold and under the urgent one, a Stop hook
  asks a small model, in the background, whether the session has just reached a
  good moment to compact or rewind. It is handed the same priced reading the
  `cut-point` skill prints, the last sixteen turns of conversation with the tool
  results stripped out and cut to 20K tokens from the oldest end, and where the
  context stands against its thresholds; it answers with a recommendation and a
  reason, or with how long to wait before the question is worth asking again.
  Claude Code hands that answer to the agent on the next turn as advice it may
  decline, and the `context-budget` skill says how to answer one. It runs on
  your own subscription's allowance, a handful of calls in a session, and
  `[watcher] enabled = false` switches it off.
- `[watcher]` in the configuration file, with `enabled`, `model`, `command`,
  `tail_turns` and `tail_tokens`. Every key has a default, so a configuration
  written before this release gains the watcher without being edited. `command`
  is the judge invocation as an argument list, and replacing it whole is how a
  judge that is not `claude -p` is run.

### Changed

- A fault that stops the hooks is said again on every tenth prompt it stands
  through, ending in how many prompts that is, where before it was said once
  for the whole session. A line said once is easily missed, and one that
  arrives mid-session leaves the context growing behind a plugin you believe is
  watching it. Prompts are counted and tool calls are not, so a turn heavy with
  them carries the fault no further. The prompt says the line again whichever
  hook first met the fault, since what it repeats is the session's record. That
  record lists every fault the session has been told about, each with the line
  it was said in and the prompts it has stood through: a fault of the same kind
  in different words is a report of its own, so fixing the key a report named
  and leaving a second mistake behind it says the new line rather than nothing,
  and each hook's internal error is listed apart from the other's.
- The first prompt that works again says the fault is gone, in the field Claude
  Code shows you rather than as a failed hook, and drops it from the session's
  record, so the same fault later is a first report rather than the middle of a
  count. Only a prompt of the measurement hook clears one: a tool call reaches the
  hooks too and is no evidence of anything. It clears only what its own run got
  through, too: both hooks read one file through one parser, so a config or
  parser error goes whichever of them met it, while an internal error only the
  resume guard can meet stays listed, and repeating, rather than being called
  over by a run that never did the guard's work. A prompt that ends before its
  own work, because it comes from a subagent or because no transcript was named
  for it, answers for the configuration it read and for nothing behind it.
- The cut-point reading prices `/compact` and carrying on beside the rewind cut
  points, on the same arithmetic, so the three can be read against one another.
  `/compact` comes first, as a cut at the tail Claude Code keeps rather than at
  a selected prompt; that tail is an estimate, taken from what a `/compact` or
  auto-compact in this session left behind where there has been one and from a
  typical 15K where there has not, and the row says which. A rewind summarize
  writes the same kind of boundary but kept the stretch the user chose, so it
  measures no tail, and a session whose only boundary came from the picker
  takes the 15K too. Carrying on comes last, as what one more turn costs at the
  size the context is now, which is what every payback is measured against. A
  reading with no cut point to offer prices those two on their own, whether the
  cache behind every prompt ran out or a compaction kept none of them verbatim,
  so a session with no rewind on offer still has two figures to choose between.
- The `cut-point` skill chooses between the three in that order: the arc rules
  on what may be summarized away before any figure is read, price picks among
  what is left with `/compact` taking a tie, and carrying on wins where every
  payback is longer than the work the arc has left.
- The `context-budget` skill is hidden from the `/` menu (`user-invocable:
  false`): it fires on the context notice, not on a command.
- The three skills carry a `when_to_use` directive and a description that
  says what each skill is, so the model routes to them rather than acting on
  its own.
- The example `denied` message of the resume guard puts the resume-or-fresh
  choice to the user as theirs and acts on the answer. The old wording ended
  with "otherwise launch fresh or stop", which an agent read as leave to launch
  fresh without asking.
- The `context-budget` skill writes a `/compact` focus line as one clause naming
  the arc and the task holding its state, after that state has gone to tasks,
  memory or files. Both it and the `cut-point` skill send a user on Remote
  Control, who cannot open the `/rewind` picker, to `/compact`.

## [0.3.0] - 2026-09-05

### Added

- A priced reading of the prompt cache: the cut points still cached, three of
  them spread across the context (oldest, middle, newest), with each one's
  expiry, what a cut there summarizes away and what it keeps, and what a
  compaction kept verbatim. A prompt no turn has answered yet is not among
  them: a cut there keeps nothing verbatim, which is `/compact` by another
  name.
- Skill `cut-point` (`/context-budget:cut-point`) and `scripts/cut-point.mts`,
  which print that reading on demand. The script finds the transcript through
  the session record, or takes `--transcript <path>`, and takes `--pricing`
  and `--pricing-overrides` for the rate it prices at.
- A payback on every listed cut point: the turns before the rewind's write
  back to the cache is earned out of what it saves per turn.
- `lib/pricing.toml`, what a cached input token costs against a fresh one
  per model and the rate the payback is priced at: 0.1 by default, 0.025 on
  `fable`. Not configuration; a `pricing.toml` under the plugin data directory
  corrects a rate row by row.

### Changed

- Both injected messages now say the session's size and send the agent to the
  `cut-point` skill for a cut point instead of naming one, so no prompt is
  quoted to the user after it has fallen out of the cache. The notice waits for
  the end of the arc in hand rather than the next natural stopping point, since
  a brief written or an agent launched is a step inside an arc and the step
  after it still needs the detail a summary would thin; the urgent message acts
  at the end of the step in hand.
- The example configuration's `fable` model row sits at 400K notice and 700K
  urgent: Fable's cache reads cost a quarter of other models', so a compaction
  at 150K takes about 35 turns to pay back.
- One file per session, `<os temp dir>/claude-context-budget/<session id>.json`,
  and everything about the session in it: the level it has been told about,
  the resume answers it has spent, the fault classes it has already been told
  about, and the transcript the last measuring run read. The measurement hook
  writes that path on every run, so the `cut-point` skill can find the
  transcript from the session's first tool call onwards. A spent answer is no
  longer recorded as an empty file named after it, and a reported fault class
  no longer as a marker file beside the record. Every write of the record is
  made under a lock directory beside it, which the next run takes over when
  the run holding it is gone: the lock names that run's pid, and the OS
  answering that there is no such process is the proof. A lock whose holder is
  still running is left standing, so a run killed mid-write costs the next one
  a probe rather than costing the session every update after it.
- The resume guard reads the cache lifetime from the subagent's newest turn
  that wrote to the cache, so a turn served from cache no longer makes it
  look cold.
- Skill `context-budget` presents only "Summarize up to here"; "Summarize from
  here" is no longer offered.
- Both hooks read one configuration file,
  `${CLAUDE_PLUGIN_DATA}/config.toml`, and nothing else. No file there is the
  unconfigured state: the context notice and the resume guard are both off and
  say nothing about it. Every key the hooks read has to be in that file, and a
  missing section or key is a config error naming it; `enabled` and the whole
  `[models]` table may still be left out.
- `hooks/config.toml` is now `hooks/config.example.toml`, a documented file to
  copy into the data directory. Neither hook reads it, so a plugin update
  cannot change what a configured session runs on.
- The hooks need Node 22.6 or newer. Under bun a dependency the plugin lacks
  is reported, never fetched on the fly.

### Fixed

- A compaction now resets the level whatever governs the model, so the notice
  speaks again on the context rebuilt after it. Switching `[default]` off and
  writing a per-model row is the documented way to measure one model only.
  Under it, the compaction was read as a model with no row, `[default]`'s
  "off" answered for it, and the record kept the level the discarded context
  was at.

### Removed

- The shipped configuration and the key-by-key merge of a user's file over it.
  A file that only carried the keys it changed now has to carry the rest.

## [0.2.0] - 2026-09-04

### Added

- `PostToolUse` and `UserPromptSubmit` hook measuring the session's context
  from the transcript's newest non-sidechain assistant turn and injecting a
  notice, then an urgent message, as it crosses per-model thresholds. Each
  level injects once and re-arms if the context falls back below it.
- `hooks/config.toml`: absolute `notice`/`urgent` token thresholds, per-model
  rows keyed by a regex on the model id (`enabled = false` switches a model
  off; Haiku ships that way), and both injected messages, all overridable from
  `${CLAUDE_PLUGIN_DATA}/config.toml`.
- Skill `context-budget`: the two rewind summarize directions, `/compact` with
  a focus line, picking and describing a cut point, and judging a stopping
  point by task.
- Skill `configure`: how the hook measures, why a notice did or did not
  appear, where overrides go and how they merge, and how to check an edit.
- `PreToolUse` resume guard on `SendMessage`, moved from den: denies resuming a
  subagent whose context is above 150K tokens, or above 50K with an expired
  prompt cache, until the user picks "Resume" in an AskUserQuestion prompt. Its
  limits, both deny reasons, and `enabled = false` to switch it off live under
  `[resume-guard]` in the same config file, overridable the same way.
- `smol-toml` as the plugin's one dependency, installed by Claude Code's
  `npm ci --ignore-scripts` when it caches the plugin.
- No stand-in values anywhere: a parser that will not import, or a config file
  that cannot be read, parsed, or used, gets one stderr line from the first
  hook run of the session that meets it, naming what is wrong, which file and
  the fix. Both hooks are then silent and inert for the rest of that session.

### Changed

- The resume guard's limits come from `[resume-guard]` in `hooks/config.toml`
  instead of the `RESUME_GATE_LARGE_TOKENS` and `RESUME_GATE_COLD_TOKENS`
  environment variables den 0.1.0 read; neither is consulted any more.

[Unreleased]: https://github.com/Stumblinbear/den/compare/context-budget--v0.4.0...HEAD
[0.4.0]: https://github.com/Stumblinbear/den/compare/context-budget--v0.3.0...context-budget--v0.4.0
[0.3.0]: https://github.com/Stumblinbear/den/compare/context-budget--v0.2.0...context-budget--v0.3.0
[0.2.0]: https://github.com/Stumblinbear/den/releases/tag/context-budget--v0.2.0
