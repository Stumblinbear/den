# Changelog

All notable changes to the den plugin are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). While the major version is 0, a
minor bump may change behavior.

## [Unreleased]

### Changed

- The `flag-reviewer` evidence pass gains a decisions step: inheriting the
  change's decisions, the brief's pins included, and reviewing only their
  execution is named as a failure mode, and each decision is asked why this
  way. The `design-decisions` skill's reuse order names the platform's own
  facilities beside the language and its library. The `coordination` skill's
  triage asks what a finding, a repair or a declared choice points at before
  routing it, and `red-green-fixer` comes back with a question when a
  confirmed fix adds a condition where removing a cause would do.

## [0.4.0] - 2026-09-06

### Removed

- The stale-diagnostics paragraph from the implementer reminder, and with it
  the relay's read of a finished agent's transcript for `.rs` edits. The hooks
  now read nothing in your project. The `coordination` skill still rules that a
  diagnostic in a file an agent is editing is a mid-edit state.
- Skill `voice`; its rules and catalog live in `writing-for-humans`. Drafting a
  commit message no longer routes through the register rules: its format is
  each person's own.

### Added

- Skill `writing-a-skill`, on how a Claude Code skill is written: the listing
  line the model routes on, the description and `when_to_use` fields in the
  measured shape, the rest of the frontmatter, what a body is, and the test
  that shows a trigger fires. The configuration-skills reference moves under
  it from `writing-for-agents`.

### Changed

- The implementer relay is now implementer triage: every finished implementer
  and `red-green-fixer` is recorded, not only one that edited Rust, and its
  reminder points at the `coordination` skill's new Implementer reports
  section, where each declared choice, question back, deviation from the brief
  and left-undone item reaches the user with an accept, answer, send back or
  defer call and its reasoning, and what contradicts the brief goes back to its
  agent at once. Its hooks are `implementer-triage-flag` and
  `implementer-triage-inject`, and its flags now wait in
  `claude-implementer-triage/`. The Briefs section keeps what a question back
  does to the brief and hands the rest to the new section.
- The `voice` skill is folded into `writing-for-humans`: the register rules
  are its own section, the grep line sits under them, the catalog of tells is
  `references/tells.md`, and a report or message for a person is one of the
  kinds it covers. The comment-reviewer preloads `writing-for-humans` alone.
- `code-architecture`, `design-decisions`, `unsafety-author` and the two
  review launchers are hidden from the `/` menu (`user-invocable: false`):
  Claude applies them when their trigger fires, and typing them was no action
  a person takes.
- Every skill the model routes to itself carries a `when_to_use` directive
  ("ALWAYS invoke this skill when ...", with the thing the model would do
  instead named) and a description that says what the skill is, so the two
  no longer restate each other.

## [0.3.0] - 2026-09-05

### Added

- Skill `voice`: the rules that keep text a person reads from sounding
  machine-written, character subjects and positive statements and sourced
  claims and varied sentence shape, with a grep run over the text first and a
  catalog of every tell with its fix, the vocabulary banded by date so it can
  go stale one band at a time.
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

- The comment-reviewer loads the `voice` skill and runs its grep twice, over
  the comments in scope before it reads them and over its own edits before it
  reports.
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

[Unreleased]: https://github.com/Stumblinbear/den/compare/den--v0.4.0...HEAD
[0.4.0]: https://github.com/Stumblinbear/den/compare/den--v0.3.0...den--v0.4.0
[0.3.0]: https://github.com/Stumblinbear/den/compare/den--v0.2.0...den--v0.3.0
[0.2.0]: https://github.com/Stumblinbear/den/compare/den--v0.1.0...den--v0.2.0
[0.1.0]: https://github.com/Stumblinbear/den/releases/tag/den--v0.1.0
