# Changelog

All notable changes to the den plugin are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). While the major version is 0, a
minor bump may change behavior.

## [Unreleased]

### Added

- Skill `design-decisions`: a recommendation names what it buys, what it
  costs and the alternative rejected; the codebase, the runtime and an
  established library are checked, in that order, before anything is written
  new; simplicity removes indirection and not the job's essentials.
- `writing-for-agents` gains `references/configuration-skills.md`: what a
  plugin's configure skill covers and in what order, so the shape is not
  re-derived per plugin.

### Changed

- The review-triage and implementer-diagnostics hooks are TypeScript, and need
  Node 22.6 or newer.
- The coordination skill launches a review, and the comment pass once the
  change is clean, without a go-ahead whenever nothing is waiting on the
  user, and runs obvious fixes as the stage continuing. Implementation, a
  fix round for findings that needed judgment, and the commit keep theirs.

### Removed

- The Opus writing rule on `SessionStart` and `PostModelSwitch` moved to the
  `model-prompts` plugin, which injects prompts for any model from a
  configuration file instead of hard-coding one model and one list.

## [0.2.0] - 2026-09-04

### Removed

- The resume cost gate on `SendMessage` moved to the `context-budget` plugin,
  where the other context-size rules live.

## [0.1.0] - 2026-09-03

Initial release.

### Added

- Skills: `coordination`, `flag-review`, `comment-review`, `code-architecture`,
  `writing-for-agents`, `unsafety-author`.
- Agents: `flag-reviewer`, `comment-reviewer`, `implementer-opus`,
  `implementer-haiku`, `implementer-fable`, `red-green-fixer`,
  `prior-art-check`, `surveyor`, `file-peek`, `synthesizer`, `localizer`,
  `localization-reviewer`.
- Hooks: review-triage and implementer-diagnostics relays, the resume cost
  gate on `SendMessage`, and the banned-phrases writing rule for Opus.
- The `flag-review` and `comment-review` skills render the review scope
  through a shared `diff-scope.sh` helper and inline the diff when it fits.

[Unreleased]: https://github.com/Stumblinbear/den/compare/den--v0.2.0...HEAD
[0.2.0]: https://github.com/Stumblinbear/den/compare/den--v0.1.0...den--v0.2.0
[0.1.0]: https://github.com/Stumblinbear/den/releases/tag/den--v0.1.0
