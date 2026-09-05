# Changelog

All notable changes to the context-budget plugin are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). While the major version is
0, a minor bump may change behavior.

## [Unreleased]

### Changed

- Both hooks read one configuration file,
  `${CLAUDE_PLUGIN_DATA}/config.toml`, and nothing else. No file there is the
  unconfigured state: the context notice and the resume guard are both off and
  say nothing about it. Every key the hooks read has to be in that file, and a
  missing section or key is a config error naming it; `enabled` and the whole
  `[models]` table may still be left out.
- `hooks/config.toml` is now `hooks/config.example.toml`, a documented file to
  copy into the data directory. Neither hook reads it, so a plugin update
  cannot change what a configured session runs on.
- The hooks need Node 22.6 or newer.
- Both hooks keep one file per session in the temp directory, holding the
  level the session has been told about and the resume answers it has spent.
  A spent answer is no longer recorded as an empty file named after it.

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
