# Changelog

All notable changes to the context-budget plugin are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). While the major version is
0, a minor bump may change behavior.

## [Unreleased]

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
  about, and the transcript the last measuring run read. The measuring hook
  writes that path on every run, so the `cut-point` skill can find the
  transcript from the session's first tool call onwards. A spent answer is no
  longer recorded as an empty file named after it, and a reported fault class
  no longer as a marker file beside the record.
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
  speaks again on the context rebuilt after it. With `[default]` switched off
  and a per-model row -- the documented way to measure one model only -- the
  compaction was read as a model with no row, `[default]`'s "off" answered for
  it, and the record kept the level the discarded context was at.

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

[Unreleased]: https://github.com/Stumblinbear/den/compare/context-budget--v0.2.0...HEAD
[0.2.0]: https://github.com/Stumblinbear/den/releases/tag/context-budget--v0.2.0
