---
name: project-direction
description: Establishes and durably records project goals, priorities, constraints and intended development with the user, preserving the reasons behind them and questions still unresolved.
when_to_use: ALWAYS invoke this skill when the user asks to establish or revisit project direction, and when a task depends on project direction that is missing, conflicting or superseded. Do not infer project commitments or conduct the discovery directly; use this skill first.
---

# Project direction

The user decides where the project is going. Your job is to find the decisions
that are still missing and explain what each one would change. Hold this
conversation yourself, in the main session, where the user is there to answer.

This conversation is discovery: the user sets the project's goals and
priorities, and you ask and record. It has no limit on time or on the number of
questions unless the user sets one. Keep investigating and asking until you
understand the project's goals and how the user means it to develop, including
the reasons behind the tradeoffs that decide what gets built. Discovery ends at
the point step 5 describes, not when a document has been written.

1. **Find out what is already known.**

   Invoke `den:direction-docs` first, and follow it for everything you read from
   or write to the direction record.

   Read the project's overview, goals, roadmap and recorded decisions, if it has
   them, and use the answers the user has already given in this conversation.
   Read the code when you need to know what the product does today. The code
   shows what exists. It doesn't show what the user means to build next.

   Work out which documents state the direction that holds today. Point out to
   the user each conflict between your sources that would change a decision, and
   say which kind it is: the user explicitly changing direction, or a matter of
   interpretation the user still has to settle.

2. **Work out the wider direction.**

   Establish:

   - who the project is for;
   - what they should be able to do with it;
   - what would make the project a success;
   - the next significant capabilities or changes the user expects, which of
     them comes first, and which depends on which;
   - the constraints the work must respect;
   - what the user deliberately leaves out, and the tradeoffs they want later
     work to keep.

   The first time a project goes through discovery, cover the project as a
   whole, not only the task in front of you. On a later pass, go back over the
   parts the new information affects. Keep three things apart:

   - work the user has committed to;
   - ideas that are only possibilities;
   - direction the user has deliberately left undecided.

3. **Settle the missing decisions with the user.**

   Ask one question at a time, about the project rather than about one task, and
   let each answer decide what to ask next. When a broad goal could be read in
   ways that would lead to different work, ask for a concrete case of someone
   using the project, or for which goal comes first. With each question, say
   what its answer would change: that is what makes it worth asking. When two
   goals pull against each other, say so, and say what keeping both would cost.

   Recommend an answer only when it follows from a goal the user has stated.
   When a question is about a goal the user hasn't stated, ask it so they can
   give a goal of their own. Keep the technical consequences of an answer apart
   from what the product commits to. How something gets built is decided in the
   task that builds it, not here.

   Ask through AskUserQuestion. Ask in prose instead when a question needs a
   worked example, since the tool hides the prose written before it. Keep
   investigating every gap that can still be answered. When the user
   deliberately puts a decision off, record it, and carry on with the other
   topics: one decision put off doesn't end discovery.

4. **Record what you learn as you go.**

   Record the answers, their reasons and the questions still open throughout
   discovery, not only at the end, so another session can carry on from where
   you are without asking the same things again.

   Record what the user said explicitly as confirmed, without asking them to
   confirm it again. Mark a commitment you inferred as unconfirmed, where a
   reader will see it. Show the user what you have put together, so they can
   correct how you read them, and point out each place where it changes
   direction recorded earlier. When something the user says, or new evidence,
   calls a recorded statement into question, reopen that statement.

5. **Finish, or record where discovery stopped.**

   Discovery is finished when the project's goals, priorities and constraints,
   and how the user means it to develop, are understood and recorded, and every
   conflict that would change a decision is resolved or explicitly put off by
   the user. Keep a question the user put off apart from one you haven't
   finished looking into: the first is the user's decision, and the second is
   work still to do.

   If the user explicitly ends discovery before then, record it as interrupted,
   with every question still open. Stopping early answers none of the questions
   still open.

   Then report:

   - where the documents are;
   - the direction that was established;
   - whether discovery finished or was interrupted;
   - the questions still open.

   An open question holds up only the decisions that depend on it, and other
   work goes ahead.
