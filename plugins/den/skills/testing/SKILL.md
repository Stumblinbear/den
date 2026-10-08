---
name: testing
description: Which test a change gets, what its assertions compare against, and which tests stay in the tree.
when_to_use: ALWAYS invoke this skill when writing, keeping, removing or ruling on a test, a test a reviewer proposes or leaves in the tree among them. Do not add, delete or rule on a test directly; use this skill first.
user-invocable: false
---

# Testing

## What gets a test

A test is written for a defect that was observed, red before the fix with the
red run reported, for the rule a change introduces, at the boundary the
change promises across, and for a promise the change rests on that no test
pins.

A test pins a promise: what the code guarantees to whatever uses it, which is
other code that calls it, another program, or a person using the program. A
promise covers what comes back for what goes in, a rejection among them, the
state the code leaves for its users to read, and a format another program
reads. A detail nobody was promised is free to change, so a test on it fails
on every legitimate edit and catches nothing. A message's wording is such a
detail.

A brief says what to build, and what gets a test is what the code promises.
Logs, metrics and traces are details whoever reads them, a brief that asks for
one included: a test on one restates the line that emits it, so it fails on
every edit to that line and catches only what reading the line shows. One is
tested only when the user asks for that test. Where a catch exists so a
failure does not escape, the test asserts that nothing escaped.

## What an assertion compares against

An assertion compares against a value the test states outright or reads back
from outside the code under test. A value the test recomputes by the code's
own path is the code agreeing with itself, and the test passes whatever the
code does.

A new test fails for a reason no test in the file already fails for.

Where the input a test needs is another module's output, the test uses that
module, a helper its owner keeps, or its output written out as data; where the
promise is to take whatever that module may send, the test sends each form the
contract allows. A copy of the producer's steps in the test is the producer
agreeing with itself, and drifts from it unseen.

## Which tests stay

A test that showed a defect red has done its first job when it goes green: it
proved the fix. It stays in the tree only where it earns its upkeep, which is
where the mistake it catches would be hard to see by reading the code:

- a race;
- an ordering between steps;
- bookkeeping across calls;
- arithmetic.

A race test controls the schedule it tests; one that sleeps and hopes is not a
test.

Where the fix is plain in the code, a forwarded value or a one-line guard a
reviewer takes in at a glance, the test comes out after its green run, and the
report gives both runs and says it was removed.

A later change that touches a test's code rules on it again. One that
removes the mechanism the test guards, as making an optional field required
does, leaves it checking what a reader sees at a glance, so it comes out in
that change. One that splits or copies code rules each test before carrying
it, since a copy in every piece multiplies the upkeep and catches nothing
more.

## Ruling on a proposed test

A test someone else proposes or leaves in the tree is ruled by the same two
questions. It is kept when it pins a promise and earns its upkeep, rewritten
where it could pin one and does not, and skipped otherwise, whoever wrote it.
