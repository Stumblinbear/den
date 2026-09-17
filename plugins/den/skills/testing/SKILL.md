---
name: testing
description: Which test a change gets, what its assertions compare against, and which tests stay in the tree.
when_to_use: ALWAYS invoke this skill when writing, keeping, removing or ruling on a test, a test a reviewer proposes or leaves in the tree among them. Do not add, delete or rule on a test directly; use this skill first.
user-invocable: false
---

# Testing

## What gets a test

A test is written for a defect that was observed, red before the fix with the
red run reported, and for the rule a change introduces, at the seam the change
lives in.

A test pins a promise: what a caller may pass and what comes back, a rejection
among them, and a format another program reads. A detail nobody was promised
is free to change, so a test on it fails on every legitimate edit and catches
nothing. A message's wording is such a detail. So is a log call, that it fired
as much as what it said. Where a catch exists so a failure does not escape,
the test asserts that nothing escaped.

## What an assertion compares against

An assertion compares against a value the test states outright or reads back
from outside the code under test. A value the test recomputes by the code's
own path is the code agreeing with itself, and the test passes whatever the
code does.

A new test fails for a reason no test in the file already fails for. Where one
already drives the same inputs, the assertion joins it and is seen red there: a
second test over one scenario proves nothing the first could not, and the two
have to be kept in step.

## Which tests stay

A test that showed a defect red has done its first job when it goes green: it
proved the fix. It stays in the tree only where it earns its upkeep, which is
where the mistake it catches would be hard to see by reading the code:

- a race;
- an ordering between steps;
- bookkeeping across calls;
- arithmetic.

Where the fix is plain in the code, a forwarded value or a one-line guard a
reviewer takes in at a glance, the test comes out after its green run, and the
report gives both runs and says it was removed.

## Ruling on a proposed test

A test someone else proposes or leaves in the tree is ruled by the same two
questions. It is kept when it pins a promise and earns its upkeep, and skipped
otherwise, whoever wrote it.
