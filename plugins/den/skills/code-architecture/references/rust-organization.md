# Rust code organization

A file owns one concept. A concept is a thing you'd name if someone asked what
the file is about. If the answer is "X and Y," that's two files.

This is the only splitting rule. Line count is the symptom; concept count is
the cause.

## Contents

- What counts as one concept
- Size as a smell test
- Where to cut
- Module files as tables of contents
- When NOT to split
- Creating a new crate module
- Practical signals an agent should watch for

## What counts as one concept

A concept is the smallest unit that would lose coherence if you broke it apart.
Typical single-concept files:

- A trait and its blanket/default impls
- A struct, its inherent impls, and its trait impls that need private field access
- A closely coupled pair (a type and its builder, an error enum and its `Display`)
- A module's erasure boundary (`AnyX` trait + `AsAnyX` conversion)
- A pure-mechanism utility (a priority queue, a dirty-set, a slot map) that
  carries no domain knowledge

Two structs that don't share private state are two concepts, even if they're
related. A struct and a helper function it doesn't call are two concepts. A
1,200-line file that's one trait with many methods is one concept.

## Size as a smell test

These thresholds count lines of logic (exclude doc comments, blank lines, and
`#[cfg(test)]` blocks):

| Lines of logic | Action                                                         |
| -------------- | -------------------------------------------------------------- |
| Under ~500     | Don't think about splitting.                                   |
| ~500-1,000     | Check whether the file is still one concept. If yes, it stays. |
| Over ~1,000    | Almost certainly more than one concept. Find the seam.         |

Files legitimately above 1,000 lines exist: exhaustive trait impls for tuple
arities, FFI binding surfaces, macro expansions. They're the exception, and
the reason they're large is that they're one concept that genuinely can't split.

Doc comments and test modules don't count toward the threshold. A 1,500-line
file that's 700 lines of logic and 800 lines of doc examples is a 700-line file.

## Where to cut

When a file needs splitting, find the seam where two concepts meet:

- **Distinct mechanism.** The file contains a data structure and the algorithm
  that uses it. Split: `block.rs` (data structure), `scheduler.rs` (algorithm).
- **Separate concern axis.** The file handles both serialization and validation.
  Split along the axis.
- **Multiple top-level types that don't share private state.** Each type is its
  own file.
- **An erasure boundary.** The `AnyX`/`AsAnyX` pair goes in `any_x.rs` inside
  the concept's module directory.

Don't split along lines that scatter a concept's invariants across files. If
two pieces share private fields or uphold a joint invariant, they stay together.

## Module files as tables of contents

`mod.rs` (or the named-module file at the directory root) is a table of
contents: `mod` declarations, `pub use` re-exports, and at most a few lines
of glue. It is not a dumping ground for "doesn't fit anywhere else" code.

If a module's `mod.rs` is growing logic, that logic is a concept that wants
its own file.

## When NOT to split

- A file is long only because of doc examples or doc comments.
- A file is long only because of `#[cfg(test)] mod tests`.
- Two pieces share private fields or uphold a joint safety invariant.
- Splitting would force `pub(crate)` on fields that are currently private.
  Visibility escalation to enable a split means the split is wrong.
- The "two concepts" are actually one concept with two phases (e.g., parse
  and validate in the same pass). If they always change together, they're one
  concept.

## Creating a new crate module

When adding a new module to a crate:

1. Name the module after the concept it owns (the domain noun), not its
   technical role. `tree`, not `data_structures`. `pipeline`, not `orchestrator`.
2. If the module will contain more than one file, make it a directory with
   `mod.rs` up front. Converting a single file to a directory later is churn.
3. Expose the module's public API through re-exports in `mod.rs`. Internal
   helpers are private submodules.
4. Mechanism modules (generic data structures, utilities) carry no domain
   knowledge. If a "utility" module imports domain types, it's not a utility;
   move it into the domain module that owns those types.

## Practical signals an agent should watch for

- **You're about to add a second top-level `struct` or `enum` to a file.**
  Check whether it shares private state with the first. If not, it's a new file.
- **You're adding `pub(crate)` to a field so another file can reach it.** The
  concept boundary is probably wrong. Either the accessor belongs in this file,
  or the field belongs in that file.
- **You're writing section-banner comments** (`// ---- helpers ----`). The
  sections are concepts that want their own files.
- **You're scrolling past code to find unrelated code in the same file.** Split.
- **A `mod.rs` has more than ~30 lines of non-declaration code.** Extract it.
