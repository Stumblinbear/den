# Rust code organization

How the file and module rules of `SKILL.md` are answered in Rust, where a file
is a module and a module is the privacy boundary.

## Contents

- Privacy answers the private-state question
- What counts as one concept
- When a file is large
- Where to cut, and where not to
- The module root
- Adding a module

## Privacy answers the private-state question

A private item in Rust is visible in the module that defines it and in that
module's descendants, never in a sibling. Since each file is a module, the
compiler shows where two pieces might share private state: picture one piece
moved to a sibling file and see what would stop compiling, then look at what
each error names. A piece that would need a private field of the other, or a
function correct only when its caller keeps the invariant those fields hold,
shares its state and belongs with it. A piece that would need only the
other's type, or a function that keeps that invariant itself, needs the
other's interface: widen that type or function to `pub(super)`, leave the
fields private, and the cut runs along a seam. A piece that would compile
there unchanged, or with only its interface widened, shares no private
state, and still belongs with the other where it has no reason to change but
the other's, as an error enum's `Display` matches each variant and a trait's
blanket impl implements each method the trait requires; the compiler does not
see that binding, so ask it separately.

The question usually arrives the other way round, as a `pub(crate)` you are
about to put on a field so another file can reach it. That is the cut running
through a concept. Either the code reaching in belongs in the field's file,
as an accessor or a method, or the field belongs in the file that reaches for
it.

## What counts as one concept

Each of these is one concept and one file, because its parts read each
other's private state or change together:

- a trait and its blanket or default impls;
- a struct, its inherent impls, and the trait impls that need its private
  fields;
- a closely coupled pair: a type and its builder, an error enum and its
  `Display`;
- a module's erasure boundary: an `AnyX` trait and its `AsAnyX` conversion;
- a pure-mechanism utility, such as a priority queue, a dirty-set or a slot
  map, that carries no domain knowledge.

A struct and a helper function it does not call are two concepts, though they
sit together naturally. A 1,200-line file of one trait with many methods is
one.

## When a file is large

Length is one more moment to ask the concept question, not its answer; the
moments `SKILL.md` names, such as adding an unrelated second type, apply at
any length. Count lines of logic, leaving out doc comments, blank lines and
`#[cfg(test)]` blocks:

| Lines of logic | What the length asks of you                                    |
| -------------- | -------------------------------------------------------------- |
| Under ~500     | Nothing by itself; the other moments still apply.              |
| ~500-1,000     | Check whether the file is still one concept. If yes, it stays. |
| Over ~1,000    | Almost certainly more than one concept. Find the seam.         |

Files legitimately past 1,000 lines exist: exhaustive trait impls for tuple
arities, FFI binding surfaces, macro expansions. Each is large because it is
one concept that cannot split, and that is the test to apply before calling a
long file an exception.

## Where to cut, and where not to

A seam is where two concepts meet, and in Rust it looks like one of these:

- **A distinct mechanism.** The file holds a data structure and the algorithm
  that uses it: `block.rs` for the structure, `scheduler.rs` for the
  algorithm.
- **A separate concern axis.** The file both serializes and validates; split
  along the axis.
- **Top-level types that share no private state.** Each type takes its own
  file.
- **An erasure boundary.** The `AnyX`/`AsAnyX` pair goes in `any_x.rs` inside
  the concept's module directory.

Before cutting, check the three cases where a plausible seam is not one:

- **The pieces share private fields or uphold a joint safety invariant.** An
  `unsafe` block whose soundness rests on another piece's invariant needs that
  invariant in the same module, where its reader can check both at once.
- **The cut would force `pub(crate)` on fields that are private today.** See
  the first section: the cut runs through a concept.
- **The "two concepts" are one concept with two phases**, such as parsing and
  validating in the same pass. Ask whether they always change together; if
  they do, they are one concept.

## The module root

`mod.rs`, or the named file at the directory's root (`foo.rs` beside
`foo/`), holds `mod` declarations, `pub use` re-exports, and at most a few
lines of glue. When it carries more than about thirty lines of code that is
not a declaration, that code is a concept: give it a file named for what it
does and declare it from the root.

## Adding a module

When a new module is added to a crate, three questions settle its shape:

1. **Which layout does the crate use?** Follow it. Under the `mod.rs` layout,
   a module expected to hold more than one file starts as a directory with
   `mod.rs`, since turning `foo.rs` into `foo/mod.rs` later is a move every
   reader of the history has to follow. Under the named-file layout a child
   goes in `foo/` beside `foo.rs`, and nothing moves.
2. **What is the module's public surface?** Re-export it from the root, and
   keep internal helpers in private submodules. Callers then depend on the
   re-exported path, and the files beneath it can move without breaking them.
3. **Does a "utility" module import domain types?** Then it is not a utility:
   it is part of the domain whose types it uses, and it moves into the module
   that owns them.
