# Changelog

All notable changes to the model-prompts plugin are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). While the major version is
0, a minor bump may change behavior.

## [Unreleased]

### Added

- `SessionStart` and `PostModelSwitch` hook that writes the text of every
  configured row whose key matches the active model id into the main session's
  context, in configuration order. Subagents and unknown events are ignored.
- `${CLAUDE_PLUGIN_DATA}/config.toml`, the one file the hook reads: rows keyed
  by a regular expression on the model id, each carrying `prompt` or `file`,
  and `enabled`, `on_start` and `on_switch` to say when it speaks. No file is
  the unconfigured state and injects nothing.
- `hooks/config.example.toml` to copy into place, carrying the Opus 5 writing
  rule that moved here from the `den` plugin. It injects on every switch into
  Opus 5, since the habits come back with the model.
- `on_switch = "once"` per session per row, recorded in the session's one
  record, `<os temp dir>/claude-model-prompts/<session id>.json`, which every
  session start clears before injecting into the context it rebuilds. The
  model a hook input last named for the session — `to_model` on a switch,
  `model` at session start — is kept there too, and read back by a run whose
  own input carries none, along with the fault classes the session has already
  been told about.
- Skill `configure`: what fires and when, where the configuration lives, how
  rows compose, and how to check an edit by hand.
- `smol-toml` as the plugin's one dependency, installed by Claude Code's
  `npm ci --ignore-scripts` when it caches the plugin.
- No stand-in values anywhere: a parser that will not import, or a config file
  that cannot be read, parsed, or used, gets one stderr line from the first
  hook run of the session that meets it, naming what is wrong, which file and
  the fix, and injects nothing while the problem stands. The report is
  silenced for the rest of that session; every run still reads the file, so a
  fix takes effect on the next one.
- The hook is TypeScript, run by `lib/shared/launch.mjs` under bun when it is
  on `PATH` and otherwise under Node 22.6+, with a `.runtime` file in the data
  directory to force one. Under bun a dependency the plugin lacks is reported,
  never fetched on the fly.
