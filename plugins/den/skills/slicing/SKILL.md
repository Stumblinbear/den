---
name: slicing
description: How a change is cut into steps a reviewer holds in one read and sequenced by risk, with the test a boundary must pass, the settled techniques for cutting what looks atomic, and the interrogation of the first attempt.
when_to_use: ALWAYS invoke this skill when planning how a change will land, before its first step starts, and whenever an observation falsifies what the plan assumed. Do not order the steps directly or take the first cut as right, however obvious it looks; use this skill first.
user-invocable: false
---

# Slicing

## The unit

A step is a change that leaves the tree building and its tests green, that
a reviewer holds in one attentive read, and that lands, reviewed and
committed, before the next starts. The read is the bound: a mechanical
sweep across forty files is one read, and a hundred lines that touch three
mechanisms is not.

## Separation and order are different rules

Order is by risk. List what could make the plan wrong, and give each risk
an early step that retires it or a stated acceptance; the step that tests
the assumption most likely to be wrong goes first, and the thinnest path
end to end, a walking skeleton, comes before any breadth. A commitment
that is expensive to undo, a persisted format, a public surface, a
dependency, is decided early and landed in the latest step that can hold
it. Order never makes a boundary.

A boundary between two pieces earns its place by one of three tests:
landing the first changes what the second should be; a failure must be
attributable to one of them; or together they exceed one read. Pieces that
one trial tests land together, whatever assumptions they carry. Each
boundary costs a review, a commit, whatever the project pays to make a
change live, and the earlier piece tested on input the later one would have
changed.

## Cutting what looks atomic

The settled techniques, by name: parallel change (expand, migrate,
contract) for a change of interface or format; branch by abstraction for
swapping an implementation under live callers; strangler fig for replacing
a subsystem; a seam introduced in its own step before the behavior that
uses it; a red test as its own step when the fix is the risky part.

## The plan

A numbered sequence. Each entry carries its scope, what its landing proves,
what it depends on, and when it is done. The plan is a hypothesis: after
each step lands, what was learned rewrites the next entry. A falsified
assumption re-cuts the smallest remaining part it invalidated; a change to
the goal or to a commitment that is expensive to undo re-plans the whole
and goes to the person who decides it. A single step is a valid plan for a
small change, and is stated as one.

## Interrogate the first attempt

The first ordered set of cuts is written as if it were right, and it is
presumed wrong. Before it is put to the person who decides it, interrogate
each cut as they would: why is this boundary here, and what does landing
the earlier piece alone show that landing both together would not; why is
this step before that one, and what changes if the order is reversed; what
does this step cost the reviewer that merging it would save. A cut
survives when its answer names one of the three tests; a cut that survives
on "it is smaller" is merged. Run the same interrogation once more over
what changed. The pass is an argument against the plan, since a re-read
agrees with itself.
