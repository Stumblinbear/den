# den

A gated agent workflow for Claude Code. The main session designs, briefs, and
delegates; standing agents do the production work; every launch is authorized
on its own.

## What it provides

Skills, applied by Claude when their trigger fires. The ones a person can
also run as `/den:<name>` are project-direction, direction-docs, scoping, writing-for-agents,
writing-for-humans and writing-a-skill; the rest are hidden from the `/` menu:

- `coordination`: the rules the main session runs under. Delegation, agent
  routing, launch authorization, review and commit gates, how to talk to you.
  Invoke it yourself; it is never loaded automatically, and it never reaches a
  subagent.
- `project-direction`: establishes or updates project goals, priorities,
  constraints and intended development with you before task scoping. Discovery
  has no default time or question budget. It records the understanding durably
  and, if you end the pass early, preserves unresolved questions for a future
  session.
- `direction-docs`: creates and maintains the durable direction record from
  established goals and agreed changes. It owns document structure, links,
  sources and uncertainty; discovery uses it while recording answers, and
  scoping uses it when a clarification changes project direction.
- `scoping`: connects an ask to project goals, constraints and planned
  developments before a brief is written, distinguishing confirmed direction
  from assumptions. It reads available context first, then asks about
  consequential choices: up to five questions, or as many as it takes when
  you ask for the pass. That limit applies only to task scoping; project
  discovery is unbounded. Unanswered decisions remain open.
- `design-exploration`: runs the design-exploration workflow before a brief is
  written for a change that adds a module, a persisted format, a public
  surface or a new mechanism: three explorers propose decompositions against
  the code and the task's design basis. A judge compares suitable proposals,
  or reports missing input or no suitable proposal, and you choose. The script
  ships under `workflows/`.
- `flag-review`: runs the flag-review workflow on a pending change: a bug
  hunter, a quality reviewer and a decisions reviewer each read it blind to
  the others, and a synthesizer writes one ranked report with unresolved
  questions kept separate. The argument is a git diff range and nothing else.
  Omit it for the working tree against HEAD. The coordinator supplies the
  available design basis separately to all readers.
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
- `writing-for-humans`: what a README, a document, a doc comment, a comment
  inside a body, or a report owes the person who reads it, and the register
  that keeps it from reading as machine-written, with a catalog of the tells.
- `unsafety-author`: Rust `# Safety` contracts and unsafe documentation.

Agents, launched through the Agent tool as `den:<name>`:

- `bug-hunter` (fable), `quality-reviewer` and `decisions-reviewer` (opus):
  the flag-review workflow's readers, each given the scope and available
  design basis. The hunter returns defects with a discriminating check;
  the quality reviewer examines engineering costs against requirements; the
  decisions reviewer checks whether choices serve project goals and compares
  alternatives that meet the same requirements. None edits.
- `review-synthesizer` (opus): one ranked report from the readers' findings,
  preserving unresolved questions, assumptions and disagreements.
- `closure-verifier` (opus): verdicts a review's findings against the fixed
  tree, CLOSED or REOPENED, and reports what the fixes opened. NEEDS-DECISION
  keeps an item unresolved when closure depends on a product decision.
- `comment-reviewer` (opus): comment coverage and register on a settled change.
  It edits comments, and nothing else.
- `implementer-opus` (opus): the default implementer. Executes a pinned brief,
  uses the design basis to make choices left open, declares those choices and
  deviations, and stops dependent work on broken assumptions. Implementation
  has no implicit deadline; necessary adjacent refactoring is assessed against
  the task's requirements, with changes to accepted designs or explicit scope
  fences brought back to you before implementation.
- `implementer-haiku` (haiku): mechanical work where the compiler is the spec.
- `implementer-fable` (fable): derivation-dense work where a wrong result
  still passes the tests.
- `red-green-fixer` (opus): reproduces a finding as a failing test, then fixes
  it to green.
- `prior-art-check` (opus): how the problem is already solved, before an
  approach is chosen. Read-only.
- `surveyor` and `file-peek` (both haiku): read-only evidence sweeps, and
  targeted extraction from files too large to read whole.
- `design-explorer` (opus): one decomposition serving the task's purpose and
  project direction, from the angle it is given, with consequential choices
  tied to requirements and their costs. Read-only.
- `design-judge` (opus): checks project fit before comparing structural
  quality, current cost and cost of change; the choice stays yours.
- `localizer` and `localization-reviewer` (opus): natural target-language
  localization, and its review.

Hooks, registered while the plugin is enabled:

- Review triage: a finished `den:review-synthesizer` or
  `den:closure-verifier` is recorded, and the next
  prompt you submit carries a reminder to relay every finding with a
  fix/defer/skip recommendation and keep unanswered questions unresolved.
- Implementer triage: a finished implementer or fixer is recorded, and the next
  prompt you submit carries a reminder to put every choice it declared,
  question it asked, deviation from the brief it made and item it left undone
  to you with a call on each.

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

No file is the default above. Anything else shows you one line naming the
file, and the hook run does nothing. The data directory survives plugin updates.
`.runtime` is the only file den reads from it, and den writes nothing there.

The plugin declares no dependencies, so Claude Code installs nothing for it.

The `flag-review` and `comment-review` skills render the review scope with
`git` through `bash`, so both have to be available where the session runs.

What the hooks read: nothing of yours. Neither relay opens a source file, a
transcript, or anything else in your project.

What the hooks write: one small JSON file per finished agent, under
`claude-review-triage/` and `claude-implementer-triage/` in the OS temp
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

Agent types are matched by bare name, so an agent of your own named
`review-synthesizer` or `implementer-opus` raises the same reminder as den's.

The hooks fire whenever the plugin is enabled, whether or not you invoked
`/den:coordination`. The skills and agents do nothing until you invoke or
launch them.

The design basis uses available goals, roadmap or design documents and your
answers. Future plans can constrain today's choices without authorizing extra
implementation. `project-direction` establishes or updates that context when
it is missing, conflicting or superseded. It uses `direction-docs` to record
that understanding. `direction-docs` maintains the direction documents,
with `docs/project-direction.md` as a short entry point and substantial
topics under `docs/direction/`. Described topic links and relevant cross-links
let later tasks locate the direction they need. A short pointer from the project's
agent instructions or documentation entry point makes that entry discoverable.
It keeps confirmed direction, interpretations and unresolved questions distinguishable.

## Troubleshooting

On Node older than 22.6 with no bun on `PATH`, a hook shows you one line
naming the floor and the version it found, and does nothing. Upgrade Node, or
install bun.

A `.runtime` file holding anything but `bun` or `node` shows you one line
naming the file, and the hook run does nothing. Delete the file to go back to
the default.

If a reminder never arrives, the two temp directories above hold the pending
flags. Deleting them resets both relays; the next completion starts over.

## Contributing

See the developer section of the [repository
README](https://github.com/stumblinbear/den#developing).
