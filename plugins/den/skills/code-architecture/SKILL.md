---
name: code-architecture
description: Where a new type, function, or module belongs, whether a file is still one concept, whether a module's interface is deep enough to earn its place, and whether a type can represent states that should not exist.
when_to_use: ALWAYS invoke this skill before editing code, an existing type or function included, so a type's shape is checked when it grows and not only when it is placed.
user-invocable: false
---

# Code architecture

A file owns one concept. A concept is a thing you'd name if someone asked what
the file is about. If the answer is "X and Y," that's two files.

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
- **Name a thing for what it is.** A module, type, field or function is
  named for the specific thing it is, in the domain's terms and in the
  vocabulary its siblings already use, with its role in the name (an
  identifier is an `Id`): `tree`, not `data_structures`; the thing, not the
  category it belongs to or what it resembles. A name that makes a claim,
  `default`, `common`, `simple`, holds only while the claim is true. A
  generic name is the reader's first guess made permanent and the next
  writer's dumping ground; a mechanism module carries no domain knowledge,
  and a mechanism is named for what it does, not for the feature that first
  needed it.
- **Don't escalate visibility to enable a split.** If a split forces you to
  widen a field's visibility so another file can reach it, the boundary is
  wrong.
- **Make invalid states unrepresentable.** Organization decides where code
  lives; type design decides which states can exist at all. Shape types so the
  set of constructible values approximates the set of valid domain states:
  a classification the code branches on is an enum or a constructor, an error
  included, never a string, a flag, a bool parameter that picks a kind or a
  field that is "not yet"; a refined wrapper over a re-checked primitive; a
  type's range from the domain, not from the encoding it happens to fit; and
  refinement pushed to the boundary rather than repeated at every call site.
  The states a value passes through in time count as much as the combinations
  of its fields: a value exists only once what it needs has happened, so a
  method fails on its arguments and never on the object's history.
- **An operation does what its name says, or fails.** When a `create`, an
  `add` or a `remove` cannot, because the thing already exists or is absent,
  the caller gets an error. A success that quietly did something else, a
  create that returns the existing one or a remove of nothing, guesses what
  the caller meant and hides the caller's mistake, which then surfaces
  further from its cause. Input the code does not act on is refused for the
  same reason: accepting it promises a meaning it does not have, and a
  refusal of a legitimate input is a defect. A caller that wants either
  outcome picks an operation whose name says so (`get_or_insert`,
  `ensure_dir`), and one that must tolerate retries says so in its contract.
- **One fact, one home.** A fact is stated once, on the thing it is a
  property of, and every other site derives it or is handed it. A second
  copy is a check waiting to be written, and the check is the tell: a
  comparison of two values from one source, a parameter beside the value it
  came from, a fact read before the code that needs it runs and then
  guarded, a setting copied into each record it produced, a condition at a
  distance restating a fact the code already states. A number that decides
  an outcome and lives in no setting is a fact with no home.
- **Siblings share one shape and one path.** Things that play the same role
  are represented the same way and reached by the same code; two peers
  stored as different kinds, or a second path to a state the first path
  already reaches, are one thing twice, and the second must mirror the first
  forever.

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
- **A boundary earns its cost through an obligation.** Existing variation is
  evidence for a trait or injected dependency; a confirmed requirement in the
  direction record can justify a boundary before a second implementation
  exists. Name the obligation, what the boundary costs now, and whether a
  simpler arrangement would satisfy it. An imagined future caller alone is not
  a reason.
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
- Comparing, or passing side by side, two values that came from one source.
- Near-duplicate types for one concept, which signal a missing generic
  primitive.
- A method that errors or branches on what the value has been through rather
  than on what it was given: a field that is "not yet", a flag that records
  which constructor ran or which method has been called.
- An operation that returns success without doing what its name says: a
  create that finds the thing already there, an add of something already
  held.

## Language-specific guidance

For the concrete thresholds, idioms, and mechanisms of a specific language,
read the matching references.


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
- **Error architecture:** `references/rust-errors.md` (typed errors
  everywhere, `main` included; what earns a variant; the cause in `Display`,
  not `source()`; each clause names what it is about; and `Result`-vs-`panic`
  calibration).
- **API boundary & ownership design:** `references/rust-api-boundaries.md`
  (borrow at boundaries and own deliberately, `&str`/`&[T]` over `&String`/`&Vec`,
  `AsRef`/`Into`/`impl Trait`, fixing signatures instead of cloning, and reaching
  for `Rc`/`Arc`/`Mutex` only when sharing is real).
- **Construction & conversion conventions:** `references/rust-conversions.md`
  (`new`/domain verbs/builders and why `new` may be fallible, useful `Default`,
  `From` over hand-rolled `Into`, `TryFrom`, `FromStr`, `AsRef`/`Borrow`/`Cow`,
  and the contract-breaking anti-patterns clippy flags).
