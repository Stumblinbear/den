# Changelog

All notable changes to the den plugin are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). While the major version is 0, a
minor bump may change behavior.

## [Unreleased]

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
