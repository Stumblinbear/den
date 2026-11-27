---
name: writing-architecture-docs
description: What an ARCHITECTURE.md holds, what it leaves to the code and its inline docs, and the length that keeps it read and true.
when_to_use: ALWAYS invoke this skill when creating, modifying, reviewing or shortening an ARCHITECTURE.md file. Do not write or edit an ARCHITECTURE.md directly; use this skill first.
paths: "**/ARCHITECTURE.md"
user-invocable: false
---

# Writing architecture docs

An ARCHITECTURE.md is a map of the codebase. A newcomer reads it once before
touching the code, and regular contributors come back to it. They keep reading
it only while it stays short and true. So a line belongs in it only when the
code can't tell a reader the same thing quickly, and the next ordinary commit
won't make it false. Everything else goes in the code, its doc comments, or a
separate document. Write its prose by `den:writing-for-humans`.

## What it holds

Four parts, in this order:

1. **Bird's eye view.** One or two paragraphs on the problem the project solves,
   what goes into it and what comes out. Also say anything a reader would
   otherwise assume wrongly. For example, when a service only reads a data store
   that another system writes, say so, since a reader would assume the service
   writes it too.
2. **Codemap.** The main modules and how they relate, in one or two lines per
   module. Those lines answer two questions: where is the thing that does X, and
   what does the thing I'm looking at do? List only the main modules, not the
   modules and files inside them. If the code is built in layers, a small text
   diagram of the layers helps.
3. **Invariants and boundaries.** The rules the structure depends on. The ones
   that matter most here are the ones a reader can't see by reading the code,
   often because they say that something never happens:
   - which layer never touches which;
   - which data this code only reads and never writes;
   - which format is shared with another system, so that the two must change
     together;
   - what fails at startup instead of on each request.

   A boundary belongs here, and the implementations behind it don't, because the
   boundary constrains every one of them.
4. **Cross-cutting concerns.** Error handling, configuration, testing and
   observability. Give each a short paragraph on how it works across the
   codebase, and on the one thing a contributor would otherwise get wrong.

For a project small enough that each concern is one module, the document fits in
60 to 100 lines. When it needs more than that, split it into separate documents
by concern instead of growing the one file.

## What it leaves out

The test for each sentence is whether both of these hold:

- It would still be true after a typical change to the part of the code it
  describes.
- A newcomer would act on it.

A sentence that fails either one goes somewhere else:

- How a module works inside, its step-by-step flows and its algorithms go in
  that module's doc comments.
- Pasted code, full signatures, route tables and lists of config fields stay in
  the code and its generated docs, which can't fall out of date with the code.
- Recipes, such as how to add a new endpoint, go in a contributing guide, if the
  project wants one.
- Current bugs and lists of defects go in the issue tracker. A line about a bug
  becomes false as soon as the bug is fixed.
- History, such as the refactor that gave the code its shape or who decided
  what, goes in commit messages and decision records. The reason behind an
  invariant that holds today stays, written in the present tense.

## Naming code

Name the important files, modules and types, so a reader can find them with
symbol search. Refer to code by its name, with no link, no line number and no
path deeper than its module. Each of those goes out of date the first time the
code moves, and none of them helps a reader who can search.

## Keeping it true

Update it when a boundary, an invariant or a module's responsibility changes,
rather than with every commit. A change that only moves code around inside a
module leaves it as it is.

When you edit an existing ARCHITECTURE.md, first cut every sentence that fails
the test under What it leaves out, and only then add anything. Check every
module, type and invariant it names against the code as it is now.
