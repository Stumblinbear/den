---
name: quality-bar description: "Defines what a good change looks like in any
codebase: patterns, ownership, domain model, sources of truth, interfaces,
abstraction timing, one-way doors, and deviating from a brief well."
when_to_use: ALWAYS invoke this skill when you're planning a change.
user-invocable: false
---

# Quality bar

A good change keeps the system cheap to understand and cheap to change. Code is
read and changed far more often than it is written, so the cost that matters is
how this change makes the next change to the same code easier or harder, not how
quickly this one merged. Passing the tests and doing what was asked are the
minimum a change must meet, not the sign of a good one.

## What a good change does

- **It follows the patterns already in the codebase.** Find how the codebase
  already handles the case closest to yours, and do it the same way. One way of
  doing a thing is cheaper to understand than two. A new pattern is a decision
  to raise, not a choice of style to make on your own.
- **It puts code with the concept it belongs to.** Put the code in the module
  that owns its concept, not in whichever file the task happened to lead you to.
  Code in the wrong module works today and misleads everyone who reads it later.
- **It extends the domain model.** When the system already has a concept for
  what you are adding, extend that concept. A second representation of the same
  idea, such as a boolean added beside an existing status, or a second place to
  configure something that already has one, drifts apart from the first as one
  is changed without the other, until every reader has to work out how the two
  fit together.
- **It has one source of truth.** Each piece of state is kept and updated in one
  place. State is what a program keeps and could end up holding two disagreeing
  copies of; a second copy means every change has to find and change both. A
  value both sides of an interface write, such as a route a client calls and a
  server serves, is not a copy: each side states its half of one contract, and a
  mismatch shows the first time they talk. It needs no mechanism or test to keep
  the two in step.
- **Its interfaces are small compared with the work they hide.** A module is
  worth its interface only when it hides a lot behind it. A pass-through layer
  or a wrapper adds more to learn without hiding anything. When something is
  complicated, handle it once inside the module instead of making every caller
  handle it.
- **It waits for a second case before abstracting.** Write the first case as
  concrete code. The second real case shows what the two actually have in
  common. An abstraction built before then is a guess, and it usually has the
  wrong shape.
- **It decides one-way doors on purpose.** Stored formats, public surfaces and
  dependencies are expensive to change once others rely on them. Choose them
  deliberately, and leave a way to change them later. Everything else is cheap
  to change, so it can be decided quickly.
- **Its failure paths are designed.** Decide what happens on an error, a partial
  failure, a retry and concurrent use, not only on the happy path.
- **It is the smallest design that is right.** That is neither the smallest diff
  nor flexibility for needs nobody has yet. Solve the whole problem in front of
  you.

## Signs a change stopped at its first idea

- Adding a special case for one caller instead of fixing the code it calls.
- Adding a flag parameter so that one function does two jobs.
- Writing a second implementation of something the codebase already has.
- Adding a new pattern, layer or dependency for a single use.
- Catching an error and ignoring it, or adding a sleep or a retry, to make a
  symptom go away.
- Copying a block of code and changing a few lines of the copy.
- Editing files the task did not need changed.
- Building state or control logic of your own that has no counterpart in the
  real world, such as timers, counters, permission flags, or fields whose only
  job is to tell one special case from the rest. Logic like that usually makes
  up for a basic concept missing from the domain model. Before you build it,
  look at what the standard solution to this problem in its field does.

When you notice one of these, go back and look at how the codebase solves this
problem before you continue.
