---
name: project-direction
description: Establishes and durably records project goals, priorities, constraints and intended development with the user, preserving the reasons behind them and questions still unresolved.
when_to_use: ALWAYS invoke this skill when the user asks to establish or revisit project direction, and before task scoping when relevant project direction is missing, conflicting or superseded. Do not infer project commitments or conduct the discovery directly; use this skill first.
---

# Project direction

Establish the project direction that future tasks should serve. Work with the
user to understand its purpose, priorities, constraints and intended development,
then record that understanding where later sessions can find it. The user owns
project direction; your role is to uncover missing decisions and explain their
consequences. Run this conversation in the lead session.

Discovery has no default time or question budget. Continue investigating and
questioning until the project's goals and intended development are understood,
including the reasons behind consequential tradeoffs. Producing a document is
not itself completion. The task-scoping question budget does not apply here.

1. **Recover what is already known.**

   Read the relevant project overview, goals, roadmap and existing decisions,
   and reuse answers from the conversation. Inspect code where needed to
   understand the current product. Code establishes what exists; it does not
   establish what the user intends next.

   Identify the documents that currently hold authority. Surface consequential
   conflicts, distinguishing an explicit change of direction from an
   interpretation that still needs the user's answer. Current explicit user
   direction supersedes earlier statements; a model inference does not.

2. **Establish the broader direction.**

   Establish who the project serves, what they should be able to accomplish,
   and what would make the project successful. Understand the next meaningful
   capabilities or changes the user expects, their relative priority and
   dependencies, and the constraints they must respect. Include deliberate
   exclusions and tradeoffs the user wants future work to preserve.

   On first discovery, look beyond the immediate task. On later passes, revisit
   the parts affected by new information. Distinguish committed work from
   possibilities and direction the user deliberately leaves undecided.

3. **Resolve the missing decisions with the user.**

   Ask one project-level question at a time, using each answer to choose the
   next. Seek concrete use scenarios and priorities where broad goals leave
   materially different interpretations. Explain the consequence that makes
   a question worth asking. Challenge incompatible goals and expose the cost
   of keeping both.

   Recommendations follow from goals the user has stated; questions about
   missing goals leave room for the user to supply them. Keep technical
   implications distinguishable from product commitments. Mechanisms belong
   in design exploration.

   Use AskUserQuestion, or prose when a question needs a worked example. Keep
   investigating gaps that remain answerable. A direction the user deliberately
   defers has a recorded reason and a condition for revisiting it; continue
   through the other topics rather than treating that deferral as completion.

4. **Record the understanding as it develops.**

   Read and use `den:direction-docs` before the first document update. Record
   answers, reasons and remaining questions throughout discovery so another
   session can continue without repeating it. That skill owns the document
   structure and editing conventions; this conversation establishes the meaning.

   Explicit user answers can be recorded as confirmed without asking again.
   Keep inferred commitments visibly unconfirmed. Show the resulting synthesis
   so the user can correct interpretations, and make changes to previously
   recorded direction explicit. Revisit relevant statements when new user
   direction or evidence challenges them.

5. **Finish or record an interruption.**

   Finish when the goals, priorities, constraints and intended development are
   understood and recorded, with material conflicts resolved or explicitly
   deferred by the user. Distinguish deliberate deferrals from questions you
   have not finished investigating.

   If the user explicitly ends discovery before then, persist every unresolved
   question with its context, why it matters, which decisions depend on it, and
   what would help resolve it. Mark discovery as interrupted, with enough
   context for a future session to resume. Stopping supplies no answer to the
   remaining questions.

   Return the document location, established direction, discovery status and
   remaining questions. Scoping derives the current task's design basis from
   that record. Unresolved direction holds up only the decisions that depend
   on it; future plans inform choices without authorizing their implementation.
