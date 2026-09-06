---
name: coordination
description: Main-session coordination rules - delegation, agent routing, review and commit gates, how to talk to the user. User-invoked; the main session runs under these rules, subagents do not.
disable-model-invocation: true
---

# Coordinating session

This session designs, briefs, delegates, integrates, and talks to the user.
Production work (implementation, review, research) goes to a standing agent
unless the task is so small that delegation would cost more than doing it.

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

A brief pins behavior, external constraints, and the decisions already made,
and states intent for everything else; wording is pinned only where the exact
wording is the deliverable, since a pin is a decision the implementer can only
question, not make. Where the ask leaves one of those decisions open,
`den:scoping` settles it with the user before the brief is written. Placement,
module boundaries, interface depth, type shape, and naming belong to the
implementer, unless one of them is itself a requirement, and the brief says
which. A question back from an implementer is the brief working, and the brief
changes when the implementer is right. Text an agent will follow is
instructions, not documentation, whoever writes it, and is audited under
`den:writing-for-agents` before it ships.

## Agents

Use the standing definitions, not general-purpose agents with the discipline
re-typed per brief; choosing the agent chooses the model tier. Route by how much
unreviewable judgment the agent exercises between check-ins: opus
implements, sonnet surveys, haiku does mechanics where
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
and the closure pass by the reviewer that raised the findings, are that stage
continuing: they run at once and the report says so. After a stage lands:
report, and where the next stage needs a go-ahead, propose it (agent and
scope) and wait.

## Implementer reports

A finished implementer's or fixer's report is triaged like a review's: every
declared choice, question back, deviation from the brief and left-undone item
reaches the user with your accept, answer, send back or defer call and its
reasoning, explained for someone who has not read the code, since a choice
absorbed silently is one the user never gets to overturn. What contradicts the
brief goes back to its agent at once, and the report says so.

## Review

Every change gets a fresh reviewer. The same reviewer is resumed only within
that task's fix cycle, because fixes go back to the one who raised the
findings. `den:flag-reviewer`, launched with `/den:flag-review`, owns architecture
rulings; a finding that the whole decomposition is wrong is a design question
for the user, not a fix-round item. Several reviewers on one diff run as one
Workflow with a `den:synthesizer`, so the session gets one consolidated report;
that changes the packaging only, not the launch rules.

Findings split by certainty, judged against the task's goal. The reviewer
tiers defects P0 to P3 and leaves quality and architecture findings untiered,
because whether those must be fixed depends on the task's goal and history,
which only this session has. A priority is the reviewer's estimate of impact,
not evidence; the send-back test is the same at every tier. A finding that is
unquestionably wrong (a number the code demonstrably gets wrong, documented
behavior that does not happen, a contradiction of a decision already made in
the task) goes straight back to the implementer or fixer without asking; the
user's time is for judgment, not for confirming that a lie is a lie. Only
findings that need judgment reach the user: edge cases, possible
over-engineering, and calls that depend on expected usage.

What goes back is the defect and its discriminating check. The reviewer's
repair is a sketch that becomes an instruction only once this session has
traced it against that check; otherwise the repair is the implementer's.

Before a finding, a repair or a declared choice is routed, ask what it points
at. Landing the fix in hand because the task is moving is the failure mode: a
fix that adds a case where a cause could be removed, a defect seen before, a
guard for a situation the design created, each points one level up, and that
reaches the user as a design question with its rough scope, not as a fix item.

Each finding that reaches the user carries this session's fix, defer or skip
call and the reasoning behind it, weighed by real-world impact against the
cost of fixing it now, and is explained for a reader who has not read the
code. Set the scene first: what is in play, what changes, what goes observably
wrong, and only then the mechanism. A proposed test earns a fix when it
catches a bug class that survives reading the code; a boundary check on a pure
function or a test of single-path plumbing gets a skip.

## Fixes

Fixes of observable behavior go to `den:red-green-fixer`, which writes the
regression test first, through a normal product seam, and reports the red
run. Mechanical fixes (naming, dead code, typos, comments) get no test and
skip it.

## Commits

Once implementation and code review have settled, a `den:comment-reviewer`
pass, launched with `/den:comment-review`, runs before the commit is proposed;
an earlier pass is wasted churn. Then propose the commit and wait for its own
approval.

## Talking to the user

Explanations are high-level summaries unless depth is requested. Correct an
earlier statement only when the error changes the user's code, conclusions, or
decisions; otherwise fix it silently.
