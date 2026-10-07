---
name: code-architecture
description: Where a new type, function, or module belongs, whether a file is still one concept, whether an abstraction, a module, a helper, a type or a generic, earns its place, and whether a type can represent states that should not exist.
when_to_use: ALWAYS invoke this skill before designing, sketching, reviewing, judging the quality of, deciding anything about or writing out any code, for any reason, an existing type or function included, so a type's shape is checked when it grows and not only when it is placed. Do not think through or show code directly; use this skill first.
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
  identifier is an `Id`), and an operation by the verb its language or
  framework already gives it (`spawn`, `insert`, `remove`): `tree`, not
  `data_structures`; the thing, not the category it belongs to or what it
  resembles. A name that makes a claim, `default`, `common`, `simple`,
  holds only while the claim is true. A
  generic name is the reader's first guess made permanent and the next
  writer's dumping ground; a mechanism module carries no domain knowledge,
  and a mechanism is named for what it does, not for the feature that first
  needed it. A qualifier names what sets the thing apart from its
  siblings: where every config is read from a file, `FileConfig` tells
  none of them apart. A name is checked where it is read, at a call site
  with its body unseen, since that is where most readers meet it. A
  public item is read where it is imported, away from its siblings, so a
  name that reads plainly beside them, `ParseError` in a config module,
  names nothing among an importer's imports.
  A word is distinct within its context, not across the codebase: where
  the call site tells two meanings apart, one word serves both, and a
  synonym only gives the reader a second word to learn. A rename keeps the
  pattern its siblings share; renaming one member of a family to dodge a
  clash breaks the family.
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
  an outcome and lives in no setting is a fact with no home. A fact is a
  decision the code makes, and a second copy is that decision written
  again: changing one copy and not the other makes the code wrong. What
  reads alike without sharing a decision is not a copy. Where giving a fact
  one home would take a new helper, type or generic rather than a value the
  site already holds, that home is an abstraction and earns its place as
  one, under Interfaces.
- **Siblings share one shape and one path.** Things that play the same role
  are represented the same way and reached by the same code; two peers
  stored as different kinds, or a second path to a state the first path
  already reaches, are one thing twice, and the second must mirror the first
  forever.

## Interfaces

Every abstraction gives its callers an interface: everything a caller must
know to use it correctly, its name and signature and also the invariants,
ordering constraints, error modes and configuration that come with them. A
module, a trait, a shared type, a generic and a helper function are all
abstractions, and making one is a trade: each caller stops holding what the
body does and starts holding the interface. Whether one earns its place is
the same question wherever it is decided:

**After this, does a reader of each caller need to know less to understand
and change that code correctly?**

That is the measure because it is what complexity costs: how many places one
change has to touch, how much a reader must know to make it, and what they
need to know but cannot see from where they stand. An abstraction lowers all
three when its interface is much smaller than what it hides, which is what
makes it deep, and raises them when its interface is nearly as large as its
body or the body still has to be read.

**Read the call with the body unseen.** Write the call as it will appear and
read it as someone who has never opened the body. If the name and arguments
tell them what this caller gets, what it changes and how it can fail, they
can trust it and read on: the abstraction has replaced a body with something
smaller. If they must open the body to know what this caller does, what
exists afterward, which value wins, what order things happen in, the
abstraction hides something its caller needs: the reader still needs all of
it, one jump away, under a name that told them to skip it. A body that says
no more than its name adds the jump and nothing else. The same holds between
any two functions: when following one keeps sending you into the other, they
are one piece of reasoning cut in two.

**The deletion test: imagine deleting it and ask what comes back.** An
abstraction pays for itself by hiding a decision: a rule that must hold, an
order steps must run in, a value several places must agree on, a way the work
can fail, a choice likely to change. Inline its body into each caller. If
what comes back is that decision, held now by every caller and each one a
place to get it wrong, the abstraction was earning its keep. If what comes
back is lines each caller reads plainly on its own, nothing was hidden, and
each caller reads better whole.

**Ask whether the callers want the same thing for the same reason.** Code
that reads alike is one thing only when it changes together: when changing
one copy and not the other would make the program wrong. Joining code that
answers to different reasons ties together callers that had no reason to
know of each other, and each change one of them needs arrives as a parameter
or a branch in the shared body that keeps the others as they were, moving
that caller's behaviour to a place none of them shows. The branches belong
in the callers, and the helper holds what is the same for all of them; when
a helper keeps gaining parameters whose only purpose is to let one caller
differ, put its body back into each caller, keep what that caller uses, and
look again at what they share.

**When copies do hold one decision, weigh the cure against the drift.** A
decision written twice wants one home, and what that home is worth paying
for depends on how quietly the copies can drift apart. Where a site can
compute the value from something it already holds, it derives it: that costs
nothing and cannot go stale. Where the copies sit in different files, crates
or languages and nothing would notice them disagreeing, the drift is a defect
nobody sees until it runs, and a small mechanism that hands the value across
is worth it.

**A boundary made before its second caller needs a reason that exists now.**
A trait, an injected dependency or a generic parameter pays its cost today
for flexibility used later. Something already varying across it is that
reason: two implementations, or a test that needs a stand-in for an external
system. A requirement already settled for the project is too, before the
second implementation exists. Name the obligation, what the boundary costs
now, and whether something simpler meets it; an imagined future caller alone
is not a reason. A generic over types that only look alike is judged the same
way: types that share one concept's invariants and operations make a good
generic, types that share a shape do not, and its signature is one more
thing every reader parses. A library's callers are outside the tree, so an
exported item only the tests exercise is the product, judged on its depth
and the obligation it meets, not on how many in-tree callers it has.

**Tests are callers.** Tests cross the same interface callers do, so a test
that reaches past it, building private parts or asserting on internal state,
is a reader who needs something the interface hides: the abstraction is the
wrong shape, and the change belongs in the abstraction, not the test. When
shallow pieces merge behind one deeper interface, the tests of the pieces
test interfaces that no longer have callers; once tests exist at the new
interface, delete the old ones.

## Signals to watch for while editing

- Adding a second independent top-level type to a file that doesn't share state
  with the first.
- Widening a field's visibility so another file can reach it.
- Writing section-banner comments (`// ---- helpers ----`): the sections are
  concepts that want their own files.
- Scrolling past unrelated code to reach the code you're editing.
- Adding a trait whose only implementor is the production type.
- Writing a type whose methods each forward to one call on a field, with no
  invariant of its own to keep.
- A test constructing a module's private parts, or asserting on its internal
  state, to reach behaviour the interface doesn't expose.
- Comparing, or passing side by side, two values that came from one source.
- Writing a second type that keeps the same invariants and operations as one
  that exists.
- Adding a parameter, or a branch on which caller called, to a shared
  function so one caller can behave differently from the rest.
- Opening a function to understand the line that calls it, or moving back
  and forth between two functions to follow either one.
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
