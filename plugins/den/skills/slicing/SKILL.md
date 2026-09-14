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

One markdown file, read by the person who decides it before any code
exists and by each step's implementer after, so it shows the code a step
rests on rather than describing it. `# Title`, a date line, then one
screen: a paragraph of problem and goal, a `Not doing:` line, a
`Constraints:` line, and one sentence on why the steps are in this order.
Under `## How the pieces call each other`, a text fence naming each piece
with its file and step.

Then one `## Step N: title [pending]` per step, the tag one of `committed`,
`in progress` and `pending` and the step's whole record of state, each
carrying:

- two to four sentences: its scope, what it depends on, and what each type
  it touches is once it lands, since a step cut around a method leaves the
  type around it as it was, and what that type has become is what the next
  step inherits;
- every site a shape the step removes still has, in the layers the step
  touches, since a removal that leaves one is the shape moved;
- the existing code the step rests on, pasted in a fence whose info string
  is `lang path:from-to`, and the change sketched in a `diff` fence, since
  the reader judges a cut by the code it cuts, not by prose about it;
- one `Decided:` line per decision, inside the step it affects, `Decided
  (you):` where the user made it, each ending `Rejected:` and the
  alternative; a decision still theirs is an `Open:` line with the code it
  lands in and the candidate patches;
- a `Tests:` line naming what proves it and a `Gate:` line saying when it
  is done.

A `## ` heading without a step number is prose. Plain paragraphs, `-`
lists, `**bold**`, `` `code` `` and links otherwise; `den:plan-page`
renders the file for the user.

The plan is a hypothesis: after each step lands, what was learned rewrites
the next entry and each tag. A falsified assumption re-cuts the smallest
remaining part it invalidated; a change to the goal or to a commitment that
is expensive to undo re-plans the whole and goes to the person who decides
it. A single step is a valid plan for a small change, and is stated as one.
An entry is read against the defect the step exists to remove, since an
entry that keeps the defect narrower is not a cut.

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
