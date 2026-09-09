# Project direction in den

Proposed change, 2026-09-06. This develops den's coordination workflow; it is
independent of the Codex compatibility implementation.

## What this should accomplish

Help a coordinator understand the project well enough to propose an appropriate
design before implementation. The user supplies project direction and decides
consequential tradeoffs. The coordinator discovers relevant evidence, identifies
uncertainty, and explains how that direction affects the design. Implementation
continues under den's existing authorization rules.

Reduce avoidable redesign caused by missing intent. More questions, more
alternatives, or a longer plan are not themselves success. A useful improvement
is an early question that changes an expensive decision, followed by a proposal
that reflects the answer.

## The information that needs to survive

Separate three kinds of information rather than placing every statement in
"decisions already made":

| Information | Meaning and authority |
| --- | --- |
| Project direction | User-confirmed purpose, intended users, constraints, exclusions, and relevant planned developments |
| Design basis | The task's contribution to that direction, concrete scenarios, and the coordinator's reasoned architectural implications |
| Design decision | The chosen solution and its tradeoff, with the user's approval where required |

Observed code behavior is evidence of what exists. It cannot establish what the
user wants next. Conversely, a direction document establishes intent, not proof
that an implementation behaves correctly.

Distinguish confirmed commitments, plausible developments, and unresolved
assumptions. A confirmed future capability can constrain a boundary today
without authorizing implementation of that capability. A plausible development
can support a cheap reversible choice; it does not automatically justify new
machinery. Absence of a roadmap is not a license to invent one.

Keep this information proportional. Each architectural implication should name
the relevant goal or scenario, the decision it affects, and what becomes costly
if the expectation changes. Omit background that cannot affect the task.

## Where it lives

Recommended default, pending the user's preference: reuse the project's existing
direction/roadmap document. When none exists and there is confirmed material
worth carrying across sessions, use `docs/project-direction.md`. This is a
convention with an escape hatch, not a required new document in every project.
The implementation should document one place to record the chosen path so
agents can discover a non-default location.

Persist confirmed direction and relevant uncertainties, with source and last
confirmation information. Keep the task's architectural implications and design
decision in its brief or existing design document. Only a lasting change to
project direction belongs back in the project document. Avoid several competing
copies of the roadmap.

When current user intent contradicts a saved document, use the current intent,
surface the difference, and propose the corresponding document update. A model
inference is never silently promoted into confirmed direction. Existing answers
need not be reconfirmed merely because another stage starts.

## Changes to the flow

### 1. Scoping establishes context before task choices

Extend `skills/scoping/SKILL.md` rather than introducing another mandatory
interview skill. Its opening work becomes:

- Read the relevant direction, task context and current implementation.
- Explain how this task contributes to the project and identify any missing
  intent that could change a consequential choice.
- Ask about those uncertainties before asking about detailed task behavior.
- Carry forward the resulting design basis with confirmed statements and
  remaining assumptions kept distinct.

Questions concern outcomes, expected use and priorities. Translating those into
boundaries is the coordinator's responsibility. A question earns its place by
explaining which decision the answer could change. Established context keeps
small work small; this does not require asking about the roadmap on every task.

Replace the one-sentence-diff shortcut with a check for consequential uncertainty.
A one-line schema change may need clarification; a large mechanical rename may
not. Keep the normal question budget as a limit on interview burden. Reaching
it does not authorize guessing a direction that determines an expensive choice:
report that choice as unresolved and continue only independent work.

### 2. Design exploration uses a common basis

Update `skills/design-exploration/SKILL.md`, its workflow input validation, and
the explorer/judge prompts together. Add an explicit `basis` input separate from
`ask` and `decisions`. Carry the same basis into every explorer and the judge.
Define the fields and bounds before implementation; record source references
and whether important statements are confirmed or assumed.

The basis contains intent and evaluation criteria, not the coordinator's
preferred decomposition. User-selected architectural constraints belong in
settled decisions; possible implementation consequences remain challengeable.

Replace the unsupported "five changes from now" angle with the actual relevant
change scenarios, or explicitly record that none are established. Explorers
should consider the same requirements while testing different tradeoffs. They
may converge; distinct-looking proposals are not a quality requirement.

Extend proposal output with the connection between consequential choices and
the basis, plus assumptions that could invalidate the proposal. Extend the
judge's output with unmet constraints and uncertainties. Allow the judge to
conclude that no proposal is ready for selection instead of always ranking a
winner. Compare project fit, current cost and cost of change as well as local
code structure. Keep the user's design choice explicit.

Keep the current explorer count in the first implementation to avoid combining
this correction with an orchestration redesign. Evaluate its value separately.

### 3. Briefs preserve intent through implementation

A brief is now the path for implementation that is independent of the
session's context; coupled implementation keeps its context by a fork or a
model switch, decided in
[Implementation keeps the context that designed it](implementation-handoff.md).
What follows applies to the brief path.

Update `skills/coordination/SKILL.md` to carry the relevant design basis,
accepted design, reasons, scope limits, and remaining uncertainty in the brief.
Make clear which choices are settled and which are implementation discretion.

Adjust the implementers' and fixer's brief-consumption instructions where
needed, rather than copying the scoping procedure into each agent. Open choices
are exercised in service of the basis. A broken premise returns to the
coordinator with evidence before the dependent implementation proceeds.

Project direction does not enlarge the authorized task. Preserve the mechanical
implementer's limited role and existing human approval boundaries.

### 4. Review has requirements without inheriting conclusions

The current `flag-review` workflow accepts only a Git scope, and its decisions
reviewer looks to code for the answer to why a choice was made. That is
insufficient for evaluating choices made for confirmed future requirements.

Preserve the public skill's Git-only argument. For coordinated work, let its
internal workflow call additionally identify the relevant approved basis through
a bounded reference to the brief/project document. Give all readers the same
requirements and provenance while withholding the coordinator's suspected
findings, preferred verdict, and other readers' reports.

Repository documents remain the discoverable fallback for standalone reviews.
A missing basis is a limitation on claims about project fit, not proof that a
decision is unjustified. Review can still report observable defects and costs.
Do not require a new interview to review an arbitrary diff.

Update `agents/decisions-reviewer.md` and the quality reviewer to assess
consequences against this basis. Approved choices remain challengeable when
evidence contradicts their rationale. Require an identified cost or conflict
for a finding; silence in documentation alone is an unanswered question.
Carry the basis and rationale to closure when they bear on the finding.

### 5. Architectural heuristics support the decision

Update `skills/design-decisions/SKILL.md` to own the common rule connecting
direction, uncertainty, current cost and reversibility. Scoping obtains that
context; exploration and implementation use it.

Audit `skills/code-architecture/SKILL.md` for rules that would defeat that
reasoning. In particular, a single implementation is not sufficient evidence
that a boundary is unnecessary. Require its concrete obligation and cost to
be assessed. Keep useful code-quality guidance, but treat structural heuristics
as evidence to weigh rather than an automatic veto on a justified design.

## Validation that measures the intended change

Use matched task scenarios where only project direction changes. Merely checking
that prompts contain a new section would not establish improved judgment.

| Scenario | Expected observation |
| --- | --- |
| Same feature for a disposable utility and a maintained reusable library | Questions or boundary decisions reflect lifecycle and caller differences; equal designs remain valid if justified |
| A second backend is committed versus merely imagined | The confirmed scenario affects costly commitments; the imagined one does not automatically create an abstraction |
| All task behavior is specified but intended project role is missing | The consequential uncertainty is recognized before decomposition |
| User direction already answers the question | No redundant interview |
| Saved direction conflicts with current user instruction | Conflict is surfaced; current intent is preserved |
| One-line change creates a lasting compatibility commitment | Diff size does not bypass the relevant question |
| Mechanical task with no affected architectural choice | Briefing proceeds without a direction exercise |
| Question budget expires with an expensive choice unresolved | That choice is not silently made under an assumption |
| Every design proposal conflicts with a confirmed constraint | Judge reports no acceptable candidate |
| Reviewer sees unfamiliar machinery justified by a confirmed scenario | It evaluates whether the machinery is necessary/sufficient instead of clearing or condemning it by default |

Add deterministic workflow tests for propagation of the same basis, preservation
of statement status, input rejection and handling of an unsuitable proposal.
Use recorded/mocked agent calls for transport tests. Live prompt evaluations
establish behavior; mocks do not prove understanding. Compare the current and
revised instructions on the same cases, looking at decision quality, unnecessary
questions, invented requirements, and design changes caused by missed intent.

Run live evaluations on the host/model configurations being shipped; the
unavailable workflow runner must be exercised in its actual host before claiming
end-to-end success. Keep tests of prompt wording out of the acceptance criteria.

## Suggested implementation order

1. Settle context ownership/discovery and the compact design-basis contract.
   Write the representative evaluation cases before tuning the prompts.
2. Update scoping, coordination and the shared decision guidance. Use this
   task's confirmed context to inspect the resulting brief as an example.
3. Update exploration input/output, the explorer and judge together.
4. Update review context transport, review/closure instructions, and the
   implementer instructions that need the new brief contract.
5. Run behavior and regression checks; revise README/changelog to describe the
   final behavior. Carry the same concepts into the later Codex adaptation.

This pass proposes the structure. It does not change active den skills, agent
definitions, workflow code, host configuration, or the user's approval policy.
