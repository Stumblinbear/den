# den

A gated agent workflow for Claude Code. The main session designs and decides
with you; implementation is briefed to a standing agent; reviews go to fresh
agents; every launch is authorized on its own.

## What it provides

Skills, applied by Claude when their trigger fires. The ones a person can
also run as `/den:<name>` are lead, project-direction, scoping and
diff-page; the rest are hidden from the `/` menu:

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
  added. Prose files (`.md`, `.txt` and the like) show word by word,
  whitespace-only changes are left out as `git diff -w` leaves them, and a
  file added or deleted whole starts folded. The argument is a git diff
  range with optional `git diff` options such as `-W`; omit the range for
  the working tree against HEAD. Nothing is published unless you ask for a
  link.
- `plan-page`: renders a plan, one JSON file in the shape
  `slicing/references/plan.schema.json` defines, as one self-contained page
  file and sends it to you, for reading a plan from a phone or away from the
  terminal. The page has an overview, the survey, a tab per step, and your
  decisions and the agent's proposals each with its reason. The code and
  images a plan points at are read into the page as it is written, and the
  plan file is left as it was. Claude runs it whenever it puts a plan to you.
  Nothing is published unless you ask for a link.
- `slicing`: how a change is cut into steps a reviewer holds in one read and
  sequenced by risk, with the test a boundary must pass, the settled
  techniques for cutting what looks atomic, and the interrogation of the
  first attempt, which is presumed wrong until each cut has answered the
  questions you would ask of it.
- `code-architecture`: where a type, function, or module belongs, and whether
  a type can represent states that should not exist.
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
- `quality-reviewer` (opus): reads a change for what the next reader of its
  code would object to: names, missing named types, bookkeeping, types that
  admit invalid states, large performance costs and patterns the language or
  framework warns against. Run before the review on changes the lead judges
  warrant it; its findings are `quality` or, where a repair would undo a
  ruling, `decision`. Read-only.
- `closure-verifier`: verdicts a review's findings against the fixed tree,
  CLOSED or REOPENED, and reports what the fixes opened. NEEDS-DECISION keeps
  an item unresolved when closure depends on a product decision.
- `comment-reviewer` (opus): comment coverage and register on a settled change.
  It edits comments, and nothing else.
- `implementer` (opus): the default implementer. Executes a brief,
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

- Review triage: a `review-and-fix` run's return, and a `quality-reviewer`'s
  report, arrive with a reminder to load `triage` and rule on everything they
  hold.
- Implementer triage: an implementer's report arrives with a reminder to load
  `triage`, under which every choice it declared, question it asked,
  deviation it made and item it left undone reaches you with a call on each.
  A fixer inside a `review-and-fix` run declares its choices in the run's
  return; for an implementer, the route a send-back takes is yours whenever
  the round already needs your answer.
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

The `reviewer`, `quality-reviewer`, `closure-verifier` and `comment-reviewer`
agents render the review scope with `git` through `bash`, so both have to be
available where the session runs. A working-tree scope includes untracked files that are not
ignored, rendered as the new files they would become; a range between two
revisions does not.

The lead stages the working tree with `git add -A` before each
`review-and-fix` run, and after a clean run writes the index as a tree with
`git write-tree`: the snapshot the next run reviews against. Nothing
references that tree, and `git gc` prunes it once it is two weeks old.

What the hooks read: the path of the file an edit is about to change, the
text of every prompt submitted, including the reports subagents hand back and
the notices of finished background tasks, and den's own `review-and-fix`
workflow file. A prompt is examined for who sent it and which workflow it
reports, and none of it is stored. Nothing in your project is opened.

What the hooks write: one small JSON file per agent report, under
`claude-review-triage/` and `claude-implementer-triage/` in the OS temp
directory, inside a subdirectory named for the session so that one session
never hears another's agents. The file is deleted as its reminder is injected;
the session's subdirectory stays.

What the hooks can do to a session: add one reminder for each agent report or
`review-and-fix` return to the context of the turn it arrives on, and one
line before an edit to a skill, an agent definition, a hook or a rules file.
You see a line only when a `review-and-fix` return or an agent's hand-back
cannot be read, and no
tool call is ever blocked.

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
output and the test run out of your main context. Work past a few turns goes
to an implementer with a brief, since each turn a fork takes after its spawn
reads the whole session context again. Once the change is in the
working tree and the session has put the implementer's report to you, it runs
`review-and-fix` on the tree with the task's goal. The run fixes the defects
it finds and returns once; the session brings you the decisions that are
yours, launches a fixer for what it rules, reviews again, and proposes the
commit.

## Operation and limitations

A reminder arrives with the report it is about. An agent hands its report back
through a tool call, and a hook on that call records it before the report is
delivered; the report's delivery then runs a `UserPromptSubmit` hook, which
injects the reminder. A `review-and-fix` return is recognized from its own
task notification. A report that arrives while the session is mid-turn lands,
with its reminder, at the session's next tool call or at the end of its turn.
Each report gets its own reminder, so several agents reporting together
produce one reminder each.

The workflow's description, the `description` in the `meta` of
`workflows/review-and-fix-workflow.js`, is what the hook recognizes a return
by. If a return's notification cannot be read, or the description cannot be
read from that file, you see one line saying so, and that return gets no
reminder.

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
flags. Deleting them resets both relays; the next report starts over.

## Contributing

See the developer section of the [repository
README](https://github.com/stumblinbear/den#developing).
