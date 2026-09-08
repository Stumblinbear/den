---
name: architectural-foresight
description: Identify commitments in code or proposed designs that could obstruct the project's intended development. Use during architectural planning or review of a project, design, or diff.
---

# Architectural foresight

Assess how the architecture's implicit commitments serve the project beyond the
immediate task.

## Direction and commitments

Locate relevant project direction, roadmap, and decisions, following links and
searching for relationships the supplied context omits. Understand priorities,
medium- and long-term goals, constraints, and reasons. Keep confirmed direction,
deliberate deferrals, and possibilities distinct; code establishes current
behavior, not future intent. If direction is missing or conflicting, identify
which conclusions need clarification and continue where evidence supports them.

Reconstruct what representations, ownership, interfaces, and control flow assume.
Trace facts and operations across their owners and consumers: what can each
representation express, who can change a fact, how do other representations stay
consistent, and which ordering or lifetime assumptions must hold? Use history
when it helps explain a commitment or repeated adjustments.

In planning, examine proposed commitments and the architecture they depend on.
For a diff, follow affected callers and state beyond edited lines; distinguish
new concerns from existing commitments the change reinforces or makes
consequential. In a project review, examine the broader architecture within scope.

## Consequences

Walk concrete scenarios implied by established direction through those
commitments. Explain which assumptions must change, where changes propagate,
and what becomes difficult, inconsistent, or unnecessarily expensive. An absent
future capability or an unspecified design detail is not itself an obstacle.
A traced mechanism or worked scenario can establish a consequence without an
already failing test; missing tests alone do not establish one.

Distinguish useful commitments with understood costs from accidental constraints.
Multiple representations can be appropriate when authority and synchronization
are clear. Separate complexity imposed by the domain or host from complexity
introduced by the design.

Determine whether future work needs support now, needs a decision to remain
changeable, or can accept later redesign. Weigh the present cost of keeping
options open against the cost of further commitment. Possibilities warrant
conditional reasoning, not speculative frameworks or implementation of the roadmap.

## Findings

For each consequential concern, connect the goal and its source to the embedded
assumption, cite where the code or design commits to it, and explain a concrete
scenario and its consequences. Offer a proportionate response with tradeoffs:
what should be reconsidered, why now, or what would make it worth revisiting.
Compare remedies against retaining the existing arrangement; a complete
replacement design is not required to establish a problem.

Approved designs remain open to evidence against their premises; findings do not
authorize changes. Keep unanswered questions separate and explain which answers
would alter the assessment. Report coverage limits and prioritize by consequence
and cost of further commitment. No consequential findings is a valid result.
