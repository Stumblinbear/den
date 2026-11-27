---
name: testing
description: Which test a change gets, what its assertions compare against, and which tests stay in the tree.
when_to_use: ALWAYS invoke this skill when writing, keeping, removing or ruling on a test, a test a reviewer proposes or leaves in the tree among them. Do not add, delete or rule on a test directly; use this skill first.
user-invocable: false
---

# Testing

## What gets a test

A test pins a promise, which is what the code guarantees to whatever uses it:
other code that calls it, another program, or a person using the program. A
promise covers:

- what comes back for what goes in, including a rejection;
- the state the code leaves for its users to read;
- a format another program reads.

A detail nobody was promised, such as the wording of a message, is free to
change. A test on it fails on every legitimate edit and catches nothing.

Write a test:

- For a defect that was observed. Run the test and see it go red before the
  fix goes in, and give that red run in the report.
- For the rule a change introduces, at the boundary where the change makes
  its promise.
- For a promise the change relies on that no existing test pins.

A new test has to fail for a reason that no test already in the file fails
for.

Logs, metrics and traces are details nobody was promised, whoever or whatever
reads them, and even when a brief asks for one. A brief says what to build,
but what gets a test is what the code promises. A test on a log line, a
metric or a trace only restates the line that emits it, so it fails on every
edit to that line and catches only what reading the line already shows. Test
one only when the user asks for that test.

When code catches a failure to keep it from escaping, the test checks that
nothing escaped, not the log line the catch may write.

## What an assertion compares against

An assertion compares against a value that the test either spells out or
reads back from somewhere outside the code under test. When the test computes
that value the same way the code does, the code is only agreeing with itself,
and the test passes whatever the code does.

When the input a test needs is what another module produces, take it from one
of these:

- that module itself;
- a helper that the module's owner maintains;
- the module's output, saved as data.

A copy of that module's steps written into the test matches the module only as
it was when copied, and drifts from it as the module changes, without anyone
seeing.

When the code promises to accept whatever that module may send, the test
sends each form the module's contract allows.

## Which tests stay

A test that went red on a defect has done its first job once it goes green:
it proved the fix. Keep it in the tree only when it earns its upkeep, which is
when the mistake it catches would be hard to see by reading the code, such as:

- a race;
- the order of steps;
- bookkeeping across calls;
- arithmetic.

A test for a race controls the order the threads or tasks run in, so the
interleaving it tests happens on every run. A test that sleeps and hopes for
that interleaving is not a test.

When the fix is plain in the code, such as a value passed through or a
one-line guard that a reviewer takes in at a glance, remove the test after its
green run. The report gives both runs, red and green, and says the test was
removed.

When a later change touches the code a test covers, rule again on whether the
test stays:

- When the change removes the mechanism the test guards, the test is left
  checking what a reader sees at a glance, so remove it in that same change.
  Making an optional field required is such a change: it removes the handling
  of a missing value.
- When the change splits code into pieces or copies it, rule on each test
  before carrying it into the new code. A copy of the test in every piece
  multiplies the upkeep and catches nothing more.

## Ruling on a proposed test

Rule on a test that someone else proposes or leaves in the tree with the same
two questions: does it pin a promise, and does it earn its upkeep? Who wrote
it doesn't change the ruling.

- Keep it when it does both.
- Rewrite it when it could pin a promise and doesn't.
- Otherwise leave it out of the tree, removing it if it is already there.
