# den

A gated agent workflow for Claude Code. The main session designs and decides
with you; implementation is handed off with its context kept, by a fork or a
model switch, or briefed to a standing agent when it needs none; reviews go
to fresh agents; every launch is authorized on its own.

## What it provides

Skills, applied by Claude when their trigger fires. The ones a person can
also run as `/den:<name>` are project-direction, direction-docs, scoping, writing-for-agents,
writing-for-humans and writing-a-skill; the rest are hidden from the `/` menu:

- `lead`: the rules the main session runs under. Delegation, agent
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
- `review`: launches the reviewer on a pending change with the diff already
  in its first message. The argument is a git diff range, optionally followed
  by `--plan <path>` naming the plan or brief the change was written to, and
  nothing else. Omit the range for the working tree against HEAD.
- `comment-review`: the same for the comment-reviewer, without the plan.
- `slicing`: how a change is cut into steps a reviewer holds in one read and
  sequenced by risk, with the test a boundary must pass, the settled
  techniques for cutting what looks atomic, and the interrogation of the
  first attempt, which is presumed wrong until each cut has answered the
  questions you would ask of it.
- `handoff-cost`: the reading the session arrives with before coupled
  implementation starts: what a fork of the session, a switch of its model
  and a brief each carry of the current context, as cache-miss token counts,
  followed by the question that puts the choice to you. A fork keeps the
  context and the model and works out of view; a switch keeps the context on
  the model you switch to and implements in the session; a brief carries none
  of it. Pass a model as the argument to price the switch against something
  other than opus.
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

- `reviewer` (fable): reads one change adversarially against the plan or
  brief it was written to and returns every issue as evidence: defects with
  a priority and a discriminating check, questionable patterns, and choices
  that do not serve the project's goals, with unresolved questions kept
  separate. It edits nothing.
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

- Review triage: a finished `den:reviewer` or
  `den:closure-verifier` is recorded, and the next
  prompt you submit carries a reminder to relay every finding with a
  fix/defer/skip recommendation and keep unanswered questions unresolved.
- Implementer triage: a finished implementer, fixer or fork of the session is
  recorded, and the next prompt you submit carries a reminder to put every
  choice it declared, question it asked, deviation from its brief or
  instruction it made and item it left undone to you with a call on each; a
  fork's send-backs go to a new fork.
- Transcript record: each prompt you submit leaves the session's transcript
  path in a small file, once, so the `handoff-cost` reading can find the
  transcript it measures.
- Handoff switch: when you answer `Switch model` on the Handoff question and
  then run `/model`, the switch adds one line to the session's context saying
  implementation starts now, inline; the line reaches the session with the
  next prompt you send. It reads the answer off the transcript at the moment
  of the switch, so a prompt you typed in between, or another question
  answered since, leaves the switch silent, and so does a switch you did not
  make yourself: a resume restoring the model, or an automatic one. A switch
  you made while the answer stands is the go, whatever invoked it.

No hook denies a tool call, reads your source, or changes a file in your
project. Each adds text to the main session's context, or nothing.

## Requirements and what it does on your machine

The hooks are TypeScript and run with no build step. Claude Code starts them
with `node`, so **Node 22.6 or newer** is the floor. They run under bun
instead whenever `bun` is on `PATH`.

Claude Code **2.1.251 or newer**: the handoff switch runs on the
`PostModelSwitch` event that version added, and a fork of the session is the
`subagent_type: "fork"` launch that 2.1.232 turned on by default in
interactive sessions (print mode leaves it off). On an older build the switch
never speaks and the Fork answer names a type that does not exist; everything
else works.

A file named `.runtime` in the plugin's data directory forces the choice for
this plugin. It holds one word, `bun` or `node`:

```sh
echo node > ~/.claude/plugins/data/den-den/.runtime
```

No file is the default above. Anything else shows you one line naming the
file, and the hook run does nothing. The data directory survives plugin updates.
`.runtime` is the only file den reads from it, and den writes nothing there.

The plugin declares no dependencies, so Claude Code installs nothing for it.

The `review` and `comment-review` skills render the review scope with
`git` through `bash`, so both have to be available where the session runs.

What the hooks read: the last half megabyte of the session's own transcript,
on a model switch and when the `handoff-cost` reading runs, for the newest
turn's size and the newest question you answered. Nothing in your project is
opened.

What the hooks write: one small JSON file per finished agent, under
`claude-review-triage/` and `claude-implementer-triage/` in the OS temp
directory, each deleted as its reminder is injected; and one per session
under `claude-den-session/` there, naming the transcript.

What the hooks can do to a session: add one reminder per relay to the context
of the next prompt you submit, and one line on a model switch that carries
out a standing `Switch model` answer. Nothing is shown to you, and no tool
call is ever blocked.

## Installation

In Claude Code:

```
/plugin marketplace add stumblinbear/den
/plugin install den@den
```

Run `/reload-plugins` if the install summary asks for it.

## Quick start

Start a session and invoke the lead rules:

```
/den:lead
```

The session then cites code by path and line, sends reviews and research to
the standing agents, and, once a design is pinned, asks how to hand the
implementation off: fork, switch model, or brief, each priced on the context
you would be carrying. After a change is written, authorize a review:

```
/den:review
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
`reviewer` or `implementer-opus` raises the same reminder as den's.

The hooks fire whenever the plugin is enabled, whether or not you invoked
`/den:lead`. The skills and agents do nothing until you invoke or
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

If the `handoff-cost` reading says no transcript is recorded, submit any
prompt: the record is written on the first prompt after den is enabled.

## Contributing

See the developer section of the [repository
README](https://github.com/stumblinbear/den#developing).
