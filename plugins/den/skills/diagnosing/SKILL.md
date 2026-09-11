---
name: diagnosing
description: How a cause is established from a symptom by the observation that would have contradicted it, what an absence claim owes, and what the report separates as established from assumed.
when_to_use: ALWAYS invoke this skill when working out why something behaves wrongly, a bug, a failure, an unexpected output, a suspicion that some code is unreachable or some field absent. Do not name a cause, report a mechanism or propose a fix directly; use this skill first.
---

# Diagnosing

## The unit

A diagnosis is a mechanism together with the observation that would have
contradicted it. The mechanism says which code produces the symptom, by what
path, from what input. The observation is the falsifier: one command, one file
read, one test whose result comes out differently depending on whether the
mechanism holds. A cause with no falsifier is a story that fits, and several
incompatible stories fit any symptom.

The falsifier is chosen before it runs and both its outcomes are written
first: the output if the mechanism holds, and the output if it does not. A
check whose every possible result the hypothesis accommodates has tested
nothing, and writing the two outcomes down is what exposes that while it is
still cheap.

## Absence owes a control

"That function is never called", "the field is not in the payload", "no row
matches" all rest on a query that came back empty, and an empty result is
evidence about the query as much as about the code. An absence claim carries a
control: the same query, same flags, same input, aimed at something already
known to be present. The claim stands when the control answers and the subject
does not.

Without one, a broken query reads as a clean finding.
`grep -o -P '.{0,40}Name.{0,40}'` returns nothing on binary input whatever the
file contains, so it reports every string absent; the control, that same
pattern for a string already known to be in the file, comes back empty too and
falsifies the tool instead of the code.

## The inherited premise is the first suspect

What the session already holds, a number from an earlier run, a conclusion from
an earlier turn, a summary, a comment, an agent's report, is the cheapest thing
to build on and the least examined. When an observation conflicts with one of
them, that conflict is the finding: it goes to the person deciding, carrying
both readings, before work continues on either. The expensive failure is the
synthesis that reconciles them so the task can proceed, because everything
built after it inherits whichever reading was wrong.

A premise the mechanism depends on that no observation in this session
established is established before the fix is designed, not after it fails.

## What the report separates

The symptom, the mechanism in one sentence, the falsifier and its actual output
cited as `path/file:line` or as the command that produced it, and what the
diagnosis did not establish. That last part is the substance: which step of the
mechanism has an observation behind it, and which is read off the shape of the
code, named so a reader weighs them separately.

Hedges carry none of that. "Likely", "clearly", "the real problem is" and a
confidence percentage all land as the same claim on a reader who cannot see
which step was run. The falsifier's output is what makes a step checkable, and
naming the steps that have no output is the calibration.

## Where this ends

The established mechanism is the handoff. It becomes a failing test before it
becomes a fix, under whatever rule the project sets for that; a mechanism that
cannot be made to fail on demand is not established yet, and that is itself the
finding.
