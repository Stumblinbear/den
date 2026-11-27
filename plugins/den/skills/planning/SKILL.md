---
name: planning
description: The procedure that writes a task's plan, puts it to the user and keeps it current while its steps land.
user-invocable: false
---

# Planning

A plan is one JSON file per task, at `.local/plans/<task>.json` in the
repository, in the shape `references/plan.schema.json` defines.

1. Once the user has confirmed the task's goal, create a new plan file named
   for the task, so that one task's plan never mixes with another's. Read the
   schema before you write the file.
2. If the project has a direction record, read it. It holds what the project
   is working toward, which the code can't show you. A capability the record
   plans for can decide where a boundary in the code goes, but don't build
   that capability until a task asks for it.
3. Write:
   - the problem;
   - the goal;
   - what done means;
   - what is out of scope;
   - the constraints.

   Then write the survey: the facts about the code that the plan rests on,
   each with its evidence.
4. Settle with the user each choice the plan makes that is theirs to make,
   by the lead skill's Whose call.
5. Cut the change into steps by the sections below, and list in each step's
   `after` the steps it comes after.
6. Put the plan to the user with `den:plan-page`.
7. When a step starts, set its `status` to `inProgress`.
8. After each step lands, rewrite the steps that come after it using what
   you learned, and update each step's `status`.
9. When the last step has landed, delete the plan file, and remove the
   temporary files and worktrees the task's work created, once their changes
   are committed.

When something changes the plan after it is written, go back to the numbered
item above that the change affects:

- A changed decision goes back to item 4.
- An assumption that turns out to be false goes back to item 3, to correct
  the survey fact that stated it, and to item 5, to cut again only the
  remaining steps it invalidated.
- A change to the goal or to a one-way door redoes the plan from item 3 on.
- Anything that changes what the user approved goes back to them at item 6.

The plan holds what this task settled. Leave out a rule that CLAUDE.md or
memory already states, since every session loads those anyway. Write
about the user in the third person, because agents read the plan too.

## What a step is

A step is a change that meets all three of these:

- After it, the tree builds and its tests pass.
- A reviewer can hold all of it in one attentive read.
- It lands, reviewed and committed, before any step that comes after it
  starts.

One read is the size limit, and it is a generous one. In one attentive
sitting a reviewer can hold several hundred lines across a few mechanisms, or
a mechanical sweep across forty files. A change is too big for one read when
its parts have to be judged in separate sittings, such as a rewrite of two
subsystems at once.

Each step removes the defect it exists for. Cutting the change so that a step
leaves its defect in place, only in fewer places, is not a valid cut.

## Where to cut

Pieces that need nothing from each other, and that can each be reviewed on
their own, go in separate steps, so that those steps run in parallel.

A piece that needs another stays in the same step as it, unless a cut
between them passes one of two tests:

- **Teaches:** landing the earlier piece teaches something that changes what
  the later piece should be.
- **One read:** the two pieces together are too big for one read.

When it is the other way round, and the later piece decides the shape of the
earlier one, the two are one step. For example, the callers a mechanism
exists for decide what the mechanism should be, and a decision decides the
machinery that carries it out. If such pieces are cut apart, the earlier one
gets built against a stand-in for the later one, and then the later one
rebuilds it.

Being able to tell which piece caused a failure is no reason for a cut,
because telling that is a test's job. Pieces the user judges in one trial
land in one step, whatever assumptions each of them carries.

A cut between a piece and a piece it needs costs:

- a review;
- a commit;
- whatever the project pays to make a change live;
- the earlier piece being tested on input that the later piece would have
  changed.

Most changes pay for no such cut.

## Order

Order the steps by risk. Test the assumption most likely to be wrong first,
inside the first step or as the first step. A change that is one step has
nothing to order. Steps that rely on a risky step come after it, because
what the risky step finds out changes what they should be: that is the
teaches test above.

A walking skeleton, the thinnest path that works end to end before any
breadth, is for a change that spans layers.

Decide each one-way door early, and land it in the latest step that can hold
it. A stored format, a public surface and a dependency are examples of
one-way doors.

A step comes after another only when it needs that step: either landing the
earlier step teaches what this one should be, or this one builds on the
earlier step's code. Steps where neither comes after the other run in
parallel.

Order never makes a cut. Risk, or one piece needing another, only decides
which of two pieces goes first once they are already in separate steps.

## Cutting what looks inseparable

When a cut has passed a test but the pieces look impossible to separate, use
the established technique for the case:

- parallel change (expand, migrate, contract), for a change of interface or
  format;
- branch by abstraction, for swapping an implementation under live callers;
- strangler fig, for replacing a subsystem;
- a seam added before the behavior that uses it;
- a red test before the fix, when the fix is the risky part.

Each of these carries out a cut that has already passed a test. None of them
is a reason to make one.

## Question the first draft

Write the first set of cuts as if it were right, and then assume it is wrong.
Before you put it to the user, question each cut the way the user would:

- Why is this cut here? What does landing the earlier piece alone show that
  landing both together would not?
- Why does this step come after that one, and what changes if it doesn't?
- Why don't these two steps run in parallel?
- What does this step cost the reviewer that merging it would save?

A cut stays when its answer names the teaches test or the one-read test, or
when the pieces on either side of it need nothing from each other. When the
only answer is "it is smaller", or that the later step needs the earlier one,
merge the two steps. Also merge into a later step any step that builds
something the later step will move or rebuild.

Then put the same questions once more to what that pass changed, and argue
against the plan as you do: a re-read that only checks the plan will always
find that it agrees with itself.
