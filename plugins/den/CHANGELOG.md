# Changelog

All notable changes to the den plugin are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). While the major version is 0, a
minor bump may change behavior.

## [Unreleased]

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
