# den

A gated agent workflow for Claude Code. The main session designs and decides
with you; implementation is briefed to a standing agent; reviews go to fresh
agents; every launch is authorized on its own.

## What it provides

Skills, applied by Claude when their trigger fires. The ones a person can
also run as `/den:<name>` are lead, project-direction, scoping,
diagnosing, diff-page and plan-page; the rest are hidden from the `/` menu:

- `lead`: the rules the main session runs under. Delegation, agent
  routing, launch authorization, review and commit gates, how to talk to you.
  Invoke it yourself; it is never loaded automatically, and it never reaches a
  subagent.
- `briefing`: what a brief for an implementer pins and leaves open, and how a
  plan's steps are briefed one at a time. The lead loads it before writing a
  brief.
- `triage`: how an implementer's report and a `review-and-fix` return are
  ruled item by item, what each key of the return holds, and what a commit
  proposal carries. The triage hooks tell the lead to load it.
- `testing`: which test a change gets, what its assertions compare against,
  and which tests stay in the tree. The implementer starts with it loaded.
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
- `design-exploration`: runs the `design-exploration-workflow` workflow
  before a brief is written for a change that adds a module, a persisted
  format, a public surface or a new mechanism: three explorers propose
  decompositions against the code and the project's direction record. A judge
  compares suitable proposals, or reports missing input or no suitable
  proposal, and you choose. The script ships under `workflows/`.
- `review-and-fix`: runs the `review-and-fix-workflow` workflow on the working
  tree in one pass: a review against the task's goal, one Opus fixer over every
  finding at P2 and above, a closure pass that gives a reopened finding one
  retry, and a comment pass over a tree the run left nothing open in. It edits
  your working tree without asking and never waits on the session; what it does
  not fix comes back for the session to route. The script ships under
  `workflows/`.
- `diff-page`: renders a git diff range as one page file, a collapsible
  section per file with old and new line numbers and coloured lines, and
  sends you the file, for reading a change from a phone or away from the
  terminal. Untracked files appear as the new-file hunks they become once
  added. The argument is a git diff range; omit it for the working tree
  against HEAD. Nothing is published unless you ask for a link.
- `plan-page`: renders a plan written in the `slicing` shape as one page file,
  the first screen, a step table and a section per step with its state, the
  code it rests on under its caption, coloured diff sketches and the decisions
  picked out, and sends you the file, for reading a plan from a phone or away
  from the terminal. The argument is the plan file's path; a plan with no
  title is rendered under its file name. Nothing is published unless you ask
  for a link.
- `slicing`: how a change is cut into steps a reviewer holds in one read and
  sequenced by risk, with the test a boundary must pass, the settled
  techniques for cutting what looks atomic, and the interrogation of the
  first attempt, which is presumed wrong until each cut has answered the
  questions you would ask of it.
- `code-architecture`: where a type, function, or module belongs, and whether
  a type can represent states that should not exist.
- `design-decisions`: how an engineering choice is made and stated: the
  tradeoff a recommendation carries, reuse before writing, and simplicity as
  a tool rather than a lean.
- `diagnosing`: how a cause is established from a symptom: the observation
  that would have contradicted it, what an absence claim owes, and what the
  report separates as established from assumed.
- `writing-for-agents`: principles for writing instructions an agent will
  follow.
- `writing-a-skill`: how a Claude Code skill is written, from the listing
  line the model routes on to the test that shows its trigger fires.
- `writing-for-humans`: what a README, a document, a doc comment, a comment
  inside a body, or a report owes the person who reads it, and the register
  that keeps it from reading as machine-written, with a catalog of the tells.
- `unsafety-author`: Rust `# Safety` contracts and unsafe documentation.

Agents, launched as `den:<name>` through the Agent tool or by a workflow:

- `reviewer`: reads one change adversarially against the plan or brief it was
  written to and returns every issue as evidence: defects with a priority and
  a failing test left in the tree, or a discriminating check where a test
  would need heavy scaffolding, questionable patterns, and choices that do not
  serve the project's goals; a question it would ask arrives as a decision
  finding. The tests it writes are the only files it touches.
- `closure-verifier`: verdicts a review's findings against the fixed tree,
  CLOSED or REOPENED, and reports what the fixes opened. NEEDS-DECISION keeps
  an item unresolved when closure depends on a product decision.
- `comment-reviewer` (opus): comment coverage and register on a settled change.
  It edits comments, and nothing else.
- `implementer` (opus): the default implementer. Executes a pinned brief,
  uses the direction record to make choices left open, declares those choices
  and deviations, and stops dependent work on broken assumptions.
  Implementation has no implicit deadline; necessary adjacent refactoring is
  assessed against the task's requirements, with changes to accepted designs
  or explicit scope fences brought back to you before implementation.
  Launched with the fable model override, on your approval, for
  derivation-dense work where a wrong result still passes the tests. It runs
  at medium effort.
- `implementer-low` and `implementer-high` (opus): the same implementer at low
  and at high effort. The lead picks among the three by how much the brief
  leaves open.
- `implementer-haiku` (haiku): mechanical work where the compiler is the spec.
- `prior-art-check` (opus): how the problem is already solved, before an
  approach is chosen. Read-only.
- `surveyor` (sonnet) and `file-peek` (haiku): read-only evidence sweeps, and
  targeted extraction from files too large to read whole.
- `design-explorer` (opus): one decomposition serving the task's purpose and
  project direction, from the angle it is given, with consequential choices
  tied to requirements and their costs. Read-only.
- `design-judge` (opus): checks project fit before comparing structural
  quality, current cost and cost of change; the choice stays yours.
- `localizer` and `localization-reviewer` (opus): natural target-language
  localization, and its review.

Hooks, registered while the plugin is enabled:

- Review triage: a finished `den:reviewer` or `den:closure-verifier`, as a
  `review-and-fix` run launches them, is recorded, and the next prompt you
  submit carries a reminder to load `triage` and rule on everything the run's
  return holds.
- Implementer triage: a finished implementer, fork of the session or
  `review-and-fix` fixer is recorded, and the next prompt you submit carries
  a reminder to load `triage`, under which every choice it declared, question
  it asked, deviation it made and item it left undone reaches you with a call
  on each. A fixer inside a run declares its choices in the run's return; for
  an implementer or fork, the route a send-back takes is yours whenever the
  round already needs your answer.
- Agent-text audit: an edit or write to a file under a `skills`, `agents`,
  `hooks` or `references` directory, or to a `SKILL.md` or `CLAUDE.md`, adds
  one line to the session's context before the edit, saying to write it under
  the `writing-for-agents` standard and to verify the change by running the
  agent it steers. Every other path passes in silence, and no edit is ever
  blocked.

No hook denies a tool call, reads your source, or changes a file in your
project. Each adds text to the main session's context, or nothing.

## Requirements and what it does on your machine

The hooks are TypeScript and run with no build step. Claude Code starts them
with `node`, so **Node 22.6 or newer** is the floor. They run under bun
instead whenever `bun` is on `PATH`.

Claude Code **2.1.232 or newer**: a fork of the session is the
`subagent_type: "fork"` launch that version turned on by default in
interactive sessions (print mode leaves it off). On an older build a fork
launch names a type that does not exist; everything else works.

A file named `.runtime` in the plugin's data directory forces the choice for
this plugin. It holds one word, `bun` or `node`:

```sh
echo node > ~/.claude/plugins/data/den-den/.runtime
```

No file is the default above. Anything else shows you one line naming the
file, and the hook run does nothing. The data directory survives plugin updates.
`.runtime` is the only file den reads from it, and den writes nothing there.

The plugin declares no dependencies, so Claude Code installs nothing for it.

The `reviewer` and `comment-reviewer` agents render the review scope with
`git` through `bash`, so both have to be available where the session runs.
A working-tree scope includes untracked files that are not ignored, rendered
as the new files they would become; a range between two revisions does not.

What the hooks read: the path of the file an edit is about to change. Nothing
in your project is opened.

What the hooks write: one small JSON file per finished agent, under
`claude-review-triage/` and `claude-implementer-triage/` in the OS temp
directory, inside a subdirectory named for the session so that one session
never hears another's agents. The file is deleted as its reminder is injected;
the session's subdirectory stays.

What the hooks can do to a session: add one reminder per relay to the context
of the next prompt you submit, and one line before an edit to a skill, an
agent definition, a hook or a rules file. Nothing is shown to you, and no tool
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

The session then cites code by path and line, sends research to the standing
agents, and, once a design is pinned, proposes the implementer and the step's
scope and waits for your go. A quick change the session would otherwise make
by hand goes to a fork of itself instead, which keeps the file reads, the edit
output and the test run out of your main context. Once the change is in the
working tree and the session has put the implementer's report to you, it runs
`review-and-fix` on the tree with the task's goal. The run fixes the defects
it finds and returns once; the session brings you the decisions that are
yours, launches a fixer for what it rules, reviews again, and proposes the
commit.

## Operation and limitations

A reminder arrives on the next prompt you submit, not at the moment the agent
finishes. A `SubagentStop` hook cannot write into the parent's context, so the
completion is recorded and a `UserPromptSubmit` hook injects it. Several
agents finishing together produce one reminder naming all of them.

The hooks fire whenever the plugin is enabled, whether or not you invoked
`/den:lead`. The skills and agents do nothing until you invoke or
launch them.

A brief and an exploration carry the direction record's path, and the agents
read the record there. Future plans can constrain today's choices without
authorizing extra implementation. `project-direction` establishes or updates
that context when it is missing, conflicting or superseded. It uses
`direction-docs` to record that understanding. `direction-docs` maintains the
direction documents, with `docs/project-direction.md` as a short entry point
and substantial topics under `docs/direction/`. Described topic links and
relevant cross-links let later tasks locate the direction they need. A short
pointer from the project's agent instructions or documentation entry point
makes that entry discoverable. It keeps confirmed direction, interpretations
and unresolved questions distinguishable.

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
