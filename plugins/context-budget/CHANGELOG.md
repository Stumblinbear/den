# Changelog

All notable changes to the context-budget plugin are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). While the major version is
0, a minor bump may change behavior.

## [Unreleased]

### Added

- `{cache}` placeholder in both injected messages: a prompt-cache snapshot
  naming three cached cut points (oldest, middle, newest) with each one's
  expiry, what a cut there summarizes away and what it keeps, and what a
  compaction kept verbatim.
- Skill `cut-point` (`/context-budget:cut-point`) and `scripts/cut-point.mjs`:
  the same reading taken fresh, for when the snapshot in a message has aged
  out. The script finds the transcript through the session record, or takes
  `--transcript <path>`, and takes the same `--pricing` and
  `--pricing-overrides` the measurement hook takes.
- A payback on every listed cut point: the turns before the rewind's write
  back to the cache is earned out of what it saves per turn.
- `hooks/pricing.toml`, what a cached input token costs against a fresh one
  per model and the rate the payback is priced at: 0.1 by default, 0.025 on
  `fable`. Not configuration; a `pricing.toml` under the plugin data directory
  corrects a rate row by row.

### Changed

- Shipped `fable` model row at 400K notice and 700K urgent: Fable's cache
  reads cost a quarter of other models', so a compaction at 150K takes about
  35 turns to pay back.
- The per-session record is written on every run and carries
  `transcript_path`; fault reports go into it instead of marker files, so a
  session leaves one file.
- The resume guard reads the cache lifetime from the subagent's newest turn
  that wrote to the cache, so a turn served from cache no longer makes it
  look cold.
- Skill `context-budget` presents only "Summarize up to here"; "Summarize from
  here" is no longer offered.

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
