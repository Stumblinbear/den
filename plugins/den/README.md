# den

A gated agent workflow for Claude Code. The main session designs, briefs, and
delegates; standing agents do the production work; every launch is authorized
on its own.

## What it provides

Skills, applied by Claude when their trigger fires. The ones a person can
also run as `/den:<name>` are scoping, writing-for-agents, writing-for-humans
and writing-a-skill; the rest are hidden from the `/` menu:

- `coordination`: the rules the main session runs under. Delegation, agent
  routing, launch authorization, review and commit gates, how to talk to you.
  Invoke it yourself; it is never loaded automatically, and it never reaches a
  subagent.
- `scoping`: settles the decisions an ask leaves open before a brief is
  written. One question at a time, each with a recommended answer and what it
  costs; up to five, or as many as it takes when you ask for the pass.
- `flag-review`: launches the flag-reviewer on a pending change. The argument
  is a git diff range and nothing else. Omit it for the working tree against
  HEAD.
- `comment-review`: the same for the comment-reviewer.
- `code-architecture`: where a type, function, or module belongs, and whether
  a type can represent states that should not exist.
- `design-decisions`: how an engineering choice is made and stated: the
  tradeoff a recommendation carries, reuse before writing, and simplicity as
  a tool rather than a lean.
- `writing-for-agents`: principles for writing instructions an agent will
  follow.
- `writing-a-skill`: how a Claude Code skill is written, from the listing
  line the model routes on to the test that shows its trigger fires.
- `writing-for-humans`: what a README, a document, a doc comment, or a comment
  inside a body owes the person who reads it.
- `voice`: how to keep text a person reads from sounding machine-written. The
  rules that keep it out, and a catalog of the tells with their fixes.
- `unsafety-author`: Rust `# Safety` contracts and unsafe documentation.

Agents, launched through the Agent tool as `den:<name>`:

- `flag-reviewer` (fable): full code and architecture review of a pending
  change. Reports findings; never edits.
- `comment-reviewer` (opus): comment coverage and voice on a settled change.
  It edits comments, and nothing else.
- `implementer-opus` (opus): the default implementer. Executes a pinned brief,
  declares deviations, stops on broken assumptions.
- `implementer-haiku` (haiku): mechanical work where the compiler is the spec.
- `implementer-fable` (fable): derivation-dense work where a wrong result
  still passes the tests.
- `red-green-fixer` (opus): reproduces a finding as a failing test, then fixes
  it to green.
- `prior-art-check` (opus): how the problem is already solved, before an
  approach is chosen. Read-only.
- `surveyor` (sonnet) and `file-peek` (haiku): read-only evidence sweeps, and
  targeted extraction from files too large to read whole.
- `synthesizer` (opus): one ranked decision document from proposals and
  verdicts.
- `localizer` and `localization-reviewer` (opus): natural target-language
  localization, and its review.

Hooks, registered while the plugin is enabled:

- Review triage: a finished `den:flag-reviewer` is recorded, and the next
  prompt you submit carries a reminder to relay every finding with a
  fix/defer/skip recommendation.
- Implementer diagnostics: a finished implementer that edited a Rust source is
  recorded, and the next prompt you submit carries a reminder that IDE
  diagnostics after those edits are a stale mid-edit state.

Neither hook denies a tool call, reads your source, or changes a file in your
project. Both add text to the main session's context and nothing else.

## Requirements and what it does on your machine

The hooks are TypeScript and run with no build step. Claude Code starts them
with `node`, so **Node 22.6 or newer** is the floor. They run under bun
instead whenever `bun` is on `PATH`.

A file named `.runtime` in the plugin's data directory forces the choice for
this plugin. It holds one word, `bun` or `node`:

```sh
echo node > ~/.claude/plugins/data/den-den/.runtime
```

No file is the default above. Anything else is one stderr line naming the file
and a hook run that does nothing. The data directory survives plugin updates.
`.runtime` is the only file den reads from it, and den writes nothing there.

The plugin declares no dependencies, so Claude Code installs nothing for it.

The `flag-review` and `comment-review` skills render the review scope with
`git` through `bash`, so both have to be available where the session runs.

What the hooks read: the transcript of a finished implementer, under the
session transcript's `subagents/` directory, to see whether it edited a `.rs`
file. Nothing else.

What the hooks write: one small JSON file per finished agent, under
`claude-review-triage/` and `claude-implementer-diagnostics/` in the OS temp
directory. Each file is deleted as its reminder is injected.

What the hooks can do to a session: add one reminder per relay to the context
of the next prompt you submit. Nothing is shown to you, and no tool call is
ever blocked.

## Installation

In Claude Code:

```
/plugin marketplace add stumblinbear/den
/plugin install den@den
```

Run `/reload-plugins` if the install summary asks for it.

## Quick start

Start a session and invoke the coordination rules:

```
/den:coordination
```

The session then delegates production work to the standing agents instead of
doing it itself, cites code by path and line, and asks for your go-ahead
before each launch. After a change is written, authorize a review:

```
/den:flag-review
```

The reviewer reads the working tree against HEAD and reports its findings. On
the next prompt you submit, the main session is reminded to relay all of them
with a recommendation each.

## Operation and limitations

A reminder arrives on the next prompt you submit, not at the moment the agent
finishes. A `SubagentStop` hook cannot write into the parent's context, so the
completion is recorded and a `UserPromptSubmit` hook injects it. Several
agents finishing together produce one reminder naming all of them.

The implementer relay is Rust-specific. An implementer that touched no `.rs`
file leaves no reminder, and neither does one whose transcript cannot be read.

Agent types are matched by bare name, so an agent of your own named
`flag-reviewer` or `implementer-opus` raises the same reminder as den's.

The hooks fire whenever the plugin is enabled, whether or not you invoked
`/den:coordination`. The skills and agents do nothing until you invoke or
launch them.

## Troubleshooting

On Node older than 22.6 with no bun on `PATH`, a hook prints one line naming
the floor and the version it found, and does nothing. Upgrade Node, or install
bun.

A `.runtime` file holding anything but `bun` or `node` prints one line naming
the file, and the hook run does nothing. Delete the file to go back to the
default.

If a reminder never arrives, the two temp directories above hold the pending
flags. Deleting them resets both relays; the next completion starts over.

## Contributing

See the developer section of the [repository
README](https://github.com/stumblinbear/den#developing).
