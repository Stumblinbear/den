---
name: code-architecture
description: Where a new type, function, or module belongs, whether a file is still one concept, whether a module's interface is deep enough to earn its place, and whether a type can represent states that should not exist.
when_to_use: ALWAYS invoke this skill before creating or splitting a file, module, type, or public function, while its place is still open. Do not place new code directly; use this skill first.
---

# Code architecture

A file owns one concept. A concept is a thing you'd name if someone asked what
the file is about. If the answer is "X and Y," that's two files.

This is the core splitting rule, and it is language-agnostic. Line count is the
symptom; concept count is the cause.

## The core, in any language

- **One concept per file.** The smallest unit that would lose coherence if you
  broke it apart. Two things that don't share private state are two concepts,
  even when related.
- **Find the seam, not the line count.** When a file needs splitting, cut where
  two concepts meet (distinct mechanism, separate concern axis, independent
  top-level types), never through a concept's shared invariants.
- **Size is a smell, not a rule.** A large file is a prompt to check the concept
  count, not an automatic split. A file can be legitimately large if it's one
  concept that can't split.
- **Module roots are tables of contents.** The file at a module's root declares
  and re-exports; it is not a dumping ground for "doesn't fit anywhere else"
  code. Growing logic there is a concept that wants its own file.
- **Name modules after the concept (a domain noun), not the technical role.**
  `tree`, not `data_structures`. Mechanism modules carry no domain knowledge.
- **Don't escalate visibility to enable a split.** If a split forces you to
  widen a field's visibility so another file can reach it, the boundary is
  wrong.
- **Make invalid states unrepresentable.** Organization decides where code
  lives; type design decides which states can exist at all. Shape types so the
  set of constructible values approximates the set of valid domain states:
  sum types over tag-plus-nullable-payloads, refined wrappers over re-checked
  primitives, and refinement pushed to the boundary rather than repeated at
  every call site.

## Interfaces

An interface is everything a caller must know to use a module correctly
(signature, invariants, ordering constraints, error modes, configuration), not
only the type-level surface. A module earns its place by depth: a lot of
behaviour behind a small interface. When designing one, ask whether it can
have fewer methods, simpler parameters, and more hidden inside.

- **The deletion test.** Imagine deleting the module. If the complexity
  vanishes, it was a pass-through; if it reappears across its callers, it was
  earning its keep.
- **A library's callers are outside the tree.** An exported item only the
  tests exercise is the product, not dead weight; its interface is judged on
  depth and on the obligation it meets, never on in-tree caller count.
- **One implementation is a hypothetical variation point; two is a real one.**
  Add a trait or injected dependency only when something actually varies
  across it: production plus a test double counts, if a test uses the double.
  A trait with one impl is indirection.
- **The interface is the test surface.** Callers and tests cross the same
  interface. Wanting to test past it means the module is the wrong shape.
- **Deepening replaces tests; it doesn't layer them.** When shallow pieces
  merge behind one interface, tests written against the pieces are waste
  once tests exist at the new interface. Delete them.

## Signals to watch for while editing

- Adding a second independent top-level type to a file that doesn't share state
  with the first.
- Widening a field's visibility so another file can reach it.
- Writing section-banner comments (`// ---- helpers ----`): the sections are
  concepts that want their own files.
- Scrolling past unrelated code to reach the code you're editing.
- Adding a trait whose only implementor is the production type.
- Writing a type whose methods each forward to one call on a field.
- A test constructing a module's private parts, or asserting on its internal
  state, to reach behaviour the interface doesn't expose.

## Language-specific guidance

The core above applies everywhere. For the concrete thresholds, idioms, and
mechanisms of a specific language, read the matching references. When working
in a language without a reference here, apply the core rule and its signals
directly.


### Rust

- **File & module organization:** `references/rust-organization.md` (concept
  examples for traits/impls, line thresholds, `mod.rs` as a table of contents, when
  `pub(crate)` signals a bad seam, creating a new crate module).
- **Making invalid states unrepresentable:**
  `references/rust-invalid-states.md` (parse-don't-validate, smart constructors,
  newtypes, enums over flag/`Option` combinations, `NonZero`/non-empty,
  typestate, and the API-hardening attributes, with when-not-to-use calibration).
- **Semantic types, not primitives:** `references/rust-semantic-types.md`
  (`Duration`/`Path`/`SocketAddr` over primitives, newtyping identifiers and units
  like `UserId(Uuid)`/`Meters(f64)`, why a type alias isn't a semantic type, and
  ergonomics via `derive_more`/`nutype`/`serde(transparent)`).
- **Error architecture:** `references/rust-errors.md` (domain errors vs
  erased reports, `thiserror`-vs-`anyhow` as a boundary rule, composable enums
  with `#[from]`/`#[source]`/`#[non_exhaustive]`, preserving `source()`, and
  `Result`-vs-`panic` calibration).
- **API boundary & ownership design:** `references/rust-api-boundaries.md`
  (borrow at boundaries and own deliberately, `&str`/`&[T]` over `&String`/`&Vec`,
  `AsRef`/`Into`/`impl Trait`, fixing signatures instead of cloning, and reaching
  for `Rc`/`Arc`/`Mutex` only when sharing is real).
- **Construction & conversion conventions:** `references/rust-conversions.md`
  (`new`/domain verbs/builders and why `new` may be fallible, useful `Default`,
  `From` over hand-rolled `Into`, `TryFrom`, `FromStr`, `AsRef`/`Borrow`/`Cow`,
  and the contract-breaking anti-patterns clippy flags).
