---
name: writing-architecture-docs
description: What an ARCHITECTURE.md holds, what it leaves to the code and its inline docs, and the length that keeps it read and true.
when_to_use: ALWAYS invoke this skill when creating, modifying, reviewing or shortening an ARCHITECTURE.md file. Do not write or edit an ARCHITECTURE.md directly; use this skill first.
paths: "**/ARCHITECTURE.md"
user-invocable: false
---

# Writing architecture docs

An ARCHITECTURE.md is the map a newcomer reads once before touching the code,
and every recurring contributor rereads. It earns that only while it is short
and still true, so it holds what the code cannot tell a reader quickly and
what will not change with the next ordinary commit. Everything else lives in
the code, its doc comments, or a separate document. The shape follows
matklad's ARCHITECTURE.md essay (matklad.github.io/2021/02/06/ARCHITECTURE.md.html).

## What it holds, in order

1. **Bird's eye view.** One or two paragraphs: the problem the project solves,
   what comes in, what goes out, and anything a reader would wrongly assume
   (a service that only reads a store something else writes, say).
2. **Codemap.** The coarse modules and how they relate: one or two lines per
   module answering "where is the thing that does X" and "what does the thing
   I am looking at do". A country map, not an atlas of its states. A small
   text diagram of the layers helps when there are layers.
3. **Invariants and boundaries.** The rules the structure depends on,
   especially those that are an absence and so cannot be seen by reading code:
   which layer never touches which, what is never written here, what format is
   shared with another system and must change with it, what fails at startup
   rather than per request. A boundary constrains every implementation behind
   it, which is why it belongs here and the implementation does not.
4. **Cross-cutting concerns.** Error handling, configuration, testing and
   observability, each a short paragraph of how it works across the codebase
   and the one thing a contributor would otherwise get wrong.

A project small enough to have one module per concern fits in 60 to 100
lines. A long one is split by concern, not grown.

## What it leaves out

The test for a sentence: would it still be true after a typical change to the
area it describes, and would a newcomer act on it? A sentence that fails
either belongs elsewhere.

- How a module works inside, step-by-step flows and algorithms: the module's
  own doc comments.
- Pasted code, full signatures, route tables, config field lists: the code and
  its generated docs, where they cannot go stale.
- Recipes such as "adding a new endpoint": a contributing guide, if one is
  wanted.
- Current bugs and defect lists: the issue tracker. A bug fixed next week
  leaves a false line behind.
- History, the refactor that produced the shape, who decided what: commit
  messages and decision records. The rationale that explains a present
  invariant stays, stated in the present tense.

## Naming code

Name the important files, modules and types so a reader can find them with
symbol search. Leave out links, line numbers and paths deeper than the module:
each goes stale on the first move and none helps a reader who has search.

## Keeping it true

Revise it when a boundary, an invariant or a module's responsibility changes,
not on every commit; a change that only moves code inside a module leaves it
alone. When editing an existing file, cut what fails the test above before
adding anything, and check every named module, type and invariant against the
code as it is.
