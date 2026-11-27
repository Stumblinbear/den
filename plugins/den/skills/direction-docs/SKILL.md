---
name: direction-docs
description: Creates, organizes and updates project direction documents from established goals and agreed changes, preserving their meaning, reasons and uncertainty.
when_to_use: ALWAYS invoke this skill when creating, updating or reorganizing project direction documents, whether recording discovery or incorporating direction the user clarified during a task. Do not write or edit a direction document directly; use this skill first.
user-invocable: false
---

# Direction documents

The direction record says where a project is going and why. Its content comes
from the user: from discovery, the conversation in which the user sets the
project's goals and priorities, and from direction they clarify during a task.
The user decides what the record means. A document's layout can commit to
something as surely as its sentences can: topics in a numbered list read as a
priority order, and a section for the next milestone reads as if one was
chosen. Use a heading, an order or a section only for what the user has
established.

## Work out what the edit means

Before editing, read the direction documents and the conversation or sources
the change comes from. Find the document that already holds the direction
being changed: that is where the edit goes.

Work out which kind of edit this is:

- a change of direction the user agreed to;
- a correction of wording;
- a reorganization.

Only a change of direction changes what the record commits to. A correction
or a reorganization leaves every decision as it was.

What the user now says explicitly replaces what was said earlier. An
inference of yours replaces nothing, and the earlier statement stands.

When it is unclear what the user meant, and the reading you choose would
change what the record commits to, ask the user. If the change opens wider
questions about the project's goals or priorities, settle those with the user
first, and go back to writing as the answers come in. A change the user
already agreed to, or an edit that only reorganizes, needs no new discovery:
write it.

Leave a question the user hasn't answered open in the record. Filling the gap
with a likely answer makes the document look complete, and the next reader
takes the guess as decided.

## Lay out the documents

Keep the record under `docs/`, with `docs/project-direction.md` as a short
entry point. The entry point holds:

- the project's purpose;
- its current priorities;
- the constraints that apply to the whole project;
- links to the detailed direction.

Give each decision one home, and link to it from everywhere else. Two
accounts of one decision drift apart, and then nothing says which one holds.
When the project already has a roadmap or a decision record that covers a
piece of direction, that document is its home: link to it rather than copying
it. A summary, such as one in the entry point, links to the home of the
detail it summarizes.

Put each substantial new topic in its own file under `docs/direction/`. Small
topics can share a file. Choose the topics and name the files after the
project's own subjects, not after the order discovery covered them in, since
a later reader looks direction up by subject.

## Write each topic

Keep everything about a topic together in its file:

- the direction the user established;
- the reasons for it;
- the open questions whose answers would change a decision;
- the sources it came from.

Write the record as a design document: each passage says what the design is
now and why, and a decision carries no date. When a decision settles
something a passage left open or conditional, or replaces an earlier
statement, rewrite the passage to say the result. Take out what it replaces,
including how the choice was reached and the options it beat. A reader acts
on every sentence as current, so a replaced statement left in place gets
followed.

The record holds what a product requirements document (PRD) would: what the
project does, who it is for and why, and the ideas that guide building it.
Leave out how a system is built, even once that is settled: that lives in the
code and in the task that built it.

Record how the goals relate to each other: which comes first, which depends on
which, and where serving one means giving up some of another. A preference the
user states doesn't on its own decide what gets built next, so record it as a
preference, not as the next step.

Keep three kinds of work apart:

- long-term direction;
- what the current milestone requires;
- work the user deliberately put off.

When the user puts something off on purpose, record why, and what would bring
it back up.

Keep direction the user confirmed apart from your interpretations of it and
from open questions, so a reader can tell which is which.

Whenever discovery is stopped before it finishes, keep it marked as
interrupted. For each question it left unanswered, keep:

- its context;
- what its answer would change, and which decisions depend on it;
- what would help answer it.

## Make the record easy to use

Link `docs/project-direction.md` from the project's agent instructions or from
the repository's documentation entry point, such as its README. Give each
topic link in the entry point a short description of the decisions that topic
informs, so a reader can find what they need without reading every topic.

Cross-link topics where one depends on another, and where the user pointed out
a connection. Add links for those connections only, not for every task that
might come later.

When direction changes or moves, update the links and summaries that point to
it. Then check:

- that every link resolves;
- after a reorganization, that every decision is still there with its
  conditions and limits, its reasons, its sources and its open questions.

Report:

- where the documents are;
- the edits that matter;
- what direction changed, and who decided it;
- the questions the user still has to decide.
