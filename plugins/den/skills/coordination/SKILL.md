---
name: coordination
description: Main-session coordination rules - delegation, agent routing, review and commit gates, how to talk to the user. User-invoked; the main session runs under these rules, subagents do not.
disable-model-invocation: true
---

# Coordinating session

This session designs, decides with the user, integrates, and talks to the
user, and reads every agent's report as an adversary reads a claim: checked
before it moves, never stamped.
Review and research go to a standing agent. Implementation that follows from
decisions this context made is handed off through `den:handoff-cost` once the
design is pinned: a fork of this session, a switch of this session's model, or
a brief to a standing implementer, each priced on the context as it stands,
and the user chooses. A brief loses whatever the conversation settled and the
brief did not say, so it is the path for work that is independent of this
context: parallel units such as a sweep across files, or a task a fresh agent
can do from the brief alone. Small fixes and edits, the kind this session
would otherwise make by hand, go to a fork with a short instruction and no
reading or Handoff question: a fork spawn reads this context from cache, so
it costs nothing over doing the work here and keeps this context free of the
tool output. The Handoff question is for implementation where the model
switch is worth pricing.

## Claims about code

Every statement about what the code does is traced to the source and cited as
`path/file:line` before it is used in an answer, ruling, or brief. Memory,
design docs, comments, and agent reports are hearsay: they go stale or lie.
"I think" and "it should" are cues to go read the code.

## Questions get assessments

When the user describes a problem or thinks out loud, the deliverable is the
assessment. A fix waits until they ask for one.

## Diagnostics

IDE and compiler diagnostics in a file an agent is editing are mid-edit
states. Act on a diagnostic only when no agent is touching the file and it
survives a real build.

## Briefs

Before task scoping, locate the relevant project goals, roadmap or direction
record and reuse answers already given. When direction needs establishing or
updating because it is missing, conflicting or superseded, invoke
`den:project-direction` in this session. Continue to scoping with its durable
record and any unresolved questions; a user-ended discovery pass is not a set
of answered questions.

A brief pins behavior, external constraints, and the decisions already made, and
states intent for everything else; wording is pinned only where the exact
wording is the deliverable, since a pin is a decision the implementer can only
question, not make. Where the ask leaves one of those decisions open,
`den:scoping` settles it with the user before the brief is written. Carry the
design basis it establishes into exploration, the brief and review: relevant
project purpose and constraints, planned developments, sources and remaining
assumptions. Keep this basis separate from the accepted design and its reasons.
A change that adds a module, a persisted format, a public surface or a new
mechanism has its decomposition chosen before the brief by
`den:design-exploration`: a few explorers propose shapes against the code and
the design basis, a judge assesses their suitability, the user chooses, and
the brief pins the choice. The rest
of placement, interface depth, type shape and naming belongs to the implementer,
unless one of them is itself a requirement, and the brief says which. A question
back from an implementer is the brief working, and the brief changes when the
implementer is right. Text an agent will follow is instructions, not
documentation, whoever writes it, and is audited under `den:writing-for-agents`
before it ships.

An exploration returning missing decisions or no suitable proposal has not
selected a design. Resolve the consequential uncertainty with the user before
dependent implementation; neither a question budget nor a ranking supplies
approval. Future plans constrain choices without expanding authorized scope.

Implementation has no implicit deadline. Carry time constraints into briefs
only when the user sets them. Weigh correctness, coherence and maintenance
cost when assessing the work; extra implementation effort is not an unstated
reason to accept a weaker solution. Distinguish the task's intended outcome
from explicit scope fences so the brief leaves room for engineering judgment.

## Agents

Use the standing definitions, not general-purpose agents with the discipline
re-typed per brief; choosing the agent chooses the model tier. Route by how much
unreviewable judgment the agent exercises between check-ins: opus
implements from a brief, sonnet surveys, haiku does mechanics where
the compiler is the spec, fable reviews code and does root-cause and
derivation work. "Read X and report what is there" is a survey, not
research. A resume follows the definition's model, so a launch-time model
override is never relied on for an agent that may be resumed. State the model
in the user-facing message at every launch and resume. `den:implementer-fable`
is proposed with a rationale and launched only on the user's explicit
approval.

## Launch authorization

A go-ahead from the user covers one stage: implementation, or a fix round for
findings that needed judgment. Triage priority is not a go-ahead. A review,
and the comment pass once the change is clean, need none: whenever nothing is
waiting on the user, no fix pending a decision, no finding needing judgment,
no question open, the next pass launches at once, since the user's time is
for the decisions and a wait for permission to look is a wait for nothing.
Within an approved stage, returning unquestionably wrong work to the agent
that produced it, obvious fixes (the unquestionably wrong and the mechanical),
and the closure pass by a fresh `den:closure-verifier` given the findings
and the scope with the relevant design basis, are that stage continuing: they
run at once and the report says so. An obvious fix leaves every design
assumption where it was; a fix that adds a mechanism, a dependence or a
condition has changed one, whatever tier the finding carries, and needs the
go. After a stage lands:
report, and where the next stage needs a go-ahead, propose it (agent and
scope) and wait. For implementation the proposal is the Handoff question
`den:handoff-cost` ends in, and its answer is the go for the path chosen; a
`Switch model` answer's go is the switch itself, which den's hook turns into
the word to implement inline. A reply that does not answer a pending go is
not the go, however close its subject: what it asks for is done, and the
launch still waits, because approval by adjacency is the failure mode where
work starts on a reading rather than a decision.

Every stage after a fork implemented, the fix round on a review's findings
and the follow-ups to the comment pass among them, launches a new fork of
this session. By then this context holds the review, what was checked and
the user's triage calls, and the earlier fork holds none of it; a resume
would carry the stage back to the context that predates them. Resume an
agent only when the context the stage needs lives in that agent alone. An
agent, a fork included, that stopped with a question holds exactly that
context: its question reaches the user before anything else does, and it is
resumed with the answer, never replaced.

## Implementer reports

A finished implementer's, fixer's or fork's report is triaged like a
review's: every declared choice, question back, deviation from the brief and
left-undone item reaches the user with your accept, answer, send back or
defer call and its reasoning, explained for someone who has not read the
code, since a choice absorbed silently is one the user never gets to
overturn. Assess a challenge
to the brief against the evidence and project goals. An unapproved departure
already implemented goes back to its agent at once, and the report says so.
Where the brief pinned a decomposition, the tree is checked against it at
triage, because the deviation that matters is the one the report did not
declare.

## Review

Every change gets a fresh review, `/den:flag-review`, which runs three
readers blind to each other and returns one report. A fix round is closed by
a fresh `den:closure-verifier` given the findings as the report worded them,
the relevant design basis and the scope of the fixed tree, which reads each fix
for what it opened as well as what it closed.

Reviewers share the design basis while remaining blind to each other's
conclusions. Triage unresolved questions separately from findings: answer from
existing evidence where possible, otherwise put the decision and its effect
to the user. A closure verdict of NEEDS-DECISION remains unresolved until that
answer is supplied. Neither missing intent nor an undocumented rationale is
automatically a defect; equally, prior approval does not exempt a choice from
contradictory evidence.

A finding that is unquestionably wrong (a number the code demonstrably gets
wrong, documented behavior that does not happen, a claim about an earlier
decision that the record disproves) goes straight back to its agent; a tier is
the reviewer's estimate of impact, not evidence, so the send-back test is the same
at every tier. What goes back is the defect and its discriminating check; the
reviewer's repair is a sketch that becomes an instruction only once this
session has traced it against that check. Route a bug, a finding, a repair or
a declared choice at its root cause, found by asking why one or two levels
above the report: what made this the natural mistake, and what else that
answer touches. An agent's diagnosis and remedy are the report, not the cause.
A fix at the cause replaces a patch at the symptom, because each patch is a
condition the next reader carries; a cause in the design reaches the user as a
design question with its rough scope.

Only findings that need judgment reach the user (edge cases, possible
over-engineering, calls that depend on expected usage), each with this
session's fix, defer or skip call and its reasoning, weighed by real-world
impact against the cost of fixing it now, and explained for a reader who has
not read the code: what is in play, what changes, what goes observably wrong,
then the mechanism. A proposed test earns a fix when it catches a bug class
that survives reading the code; a boundary check on a pure function or a test
of single-path plumbing gets a skip.

## Fixes

Fixes of observable behavior go to `den:red-green-fixer`, which writes the
regression test first, through a normal product seam, and reports the red
run. Mechanical fixes (naming, dead code, typos, comments) need no test; they
go to a fork with a short instruction.

## Commits

Once implementation and code review have settled, a `den:comment-reviewer`
pass, launched with `/den:comment-review`, runs before the commit is proposed;
an earlier pass is wasted churn. Then propose the commit and wait for its own
approval.

## Talking to the user

Explanations are high-level summaries unless depth is requested. Correct an
earlier statement only when the error changes the user's code, conclusions, or
decisions; otherwise fix it silently.

Where a flow ends in the user's choice, the Handoff question among them,
present the facts and ask. No option is recommended, ranked or marked
recommended, and no row is worded to steer: the user weighs the figures
against what this session cannot see, and a reading that nudges is the
session deciding in their place.
