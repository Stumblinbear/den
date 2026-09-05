# Changelog

All notable changes to the den plugin are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). While the major version is 0, a
minor bump may change behavior.

## [Unreleased]

### Added

- Skill `scoping`: the decisions an ask leaves open are put to the user one at
  a time before a brief is written, dependencies first and then highest impact
  and uncertainty, each with a recommended answer and what it costs; facts are
  looked up rather than asked, the answers land in the brief's decisions
  already made, and anything left open is recorded as deferred.
- Skill `design-decisions`: a recommendation names what it buys, what it
  costs and the alternative rejected; the codebase, the runtime and an
  established library are checked, in that order, before anything is written
  new; simplicity removes indirection and not the job's essentials.
- `writing-for-agents` gains `references/configuration-skills.md`: what a
  plugin's configure skill covers and in what order, so the shape is not
  re-derived per plugin.
- Skill `writing-for-humans`: what a README, a document outside the code, a doc
  comment and a comment inside a body owe the person reading them, with a
  reference per kind, per render target, and per language.

### Changed

- The comment-reviewer presumes a comment in the diff fails its reference's
  test until it passes, and cuts a borderline one rather than leaving it
  standing; a public item's doc that falls short is completed instead of cut.
- The comment-reviewer reports a public item with no example instead of writing
  one: the snippet is code, and which call it shows is the author's judgment.
- The comment-reviewer adds a summary above a phase of a long function, and
  above a loop whose job the code beside it does not yield.
- The comment-reviewer consolidates an explanation repeated at several sites
  into one full comment where the decision hangs, and a one-line pointer at each
  of the others.
- The comment-reviewer judges a doc comment by the size of the contract it owes
  a caller, and holds it to no length ceiling.
- The comment-reviewer removes an ID into this project's own tracker from a
  comment the change adds, leaving a pre-existing one and any reference to
  another project's tracker.
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
