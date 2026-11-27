---
name: code-architecture
description: Where a new type, function, or module belongs, whether a file is still one concept, whether an abstraction, a module, a helper, a type or a generic, earns its place, and whether a type can represent states that should not exist.
when_to_use: ALWAYS invoke this skill before designing, sketching, reviewing, judging the quality of, deciding anything about or writing out any code, for any reason, an existing type or function included, so a type's shape is checked when it grows and not only when it is placed. Do not think through or show code directly; use this skill first.
user-invocable: false
---

# Code architecture

Each rule comes with its reason. Follow the reason, not the rule's name: a rule
applies wherever its reason does, and not where it doesn't.

## Organizing code

**Decide a file's module before you create it.** When a new file makes two or
more of a kind, put them all in a module for that kind, moving the existing
ones. The move is part of this change.

**One concept per file.** Two pieces of code are one concept when one keeps
private state for the other, when they uphold an invariant together, or when a
change to one always reaches the other, as with an error enum and the code that
writes its messages. Pieces bound by none of these are separate concepts,
however related their subjects: a parser and a formatter for the same syntax go
in two files. A banner comment dividing a file (`// ---- helpers ----`) is the
file listing its own concepts.

**Split a file where two concepts meet, not by its length.** Cut between a data
structure and the algorithm that uses it, between serialization and validation,
or between top-level types that share no private state. A cut through one
concept leaves each half reaching into the other. One concept stays in one file
at any length. When a split needs a name the other file keeps private, the cut
went through a concept: move the code that needs the name next to it, rather
than making the name wider. A type that keeps its own invariant isn't shared
state; it is an interface to call.

**Group files by the same bonds.** A directory holds the files of one larger
concept: files that change together, or that share machinery nothing else uses.
When files could be grouped by role or by feature, group them by the change that
happens more often. A file whose concept grows children becomes a directory,
with its root file as the table of contents. Name a group for its concept.

**A module's root is its table of contents.** The root declares the module's
children and its public surface, so a reader learns what the module offers
without reading an implementation. Code that "doesn't fit anywhere else" is a
concept with no file yet: name it and give it one. A few lines of glue wiring
the children together can stay in the root.

## Naming

**Name a thing for what it is.** Use the domain's words, and the words its
siblings already use. Use the word the language or framework already has for
that kind of thing, since a synonym is a second word to learn. Put the thing's
role in its name: an identifier's name says it is an id.

Name a function by what it does:

- one that acts takes the verb its language gives it (`insert`, `remove`,
  `open`);
- one that returns a value it holds, or works out cheaply, is named for the
  value (`len`, `parent`);
- a lookup by key that may find nothing returns the absence the way its language
  does (`get(key)`), and a search by condition says so (`find`);
- a count is named as a count;
- one that answers yes or no reads as a claim about its subject (`is_empty`,
  `contains`);
- a constructor takes the name its language gives one.

A bare state word such as `drawing` or `enabled` is none of these. A keyed
lookup named like a property, `user(id)`, reads as a value that is always there.

Then check the name:

- **Where it is used, with its body and doc hidden.** The call should say what
  it does: `cleanup(jobs)` sends the reader into the body, and
  `drop_expired(jobs)` doesn't. A method is called on a variable someone else
  named, so its own name says what it returns: `entity.loaded_components()`, not
  `entity.loaded()`. A public item is read among an importer's imports:
  `ConfigParseError`, not `ParseError`. A longer name that says what the thing
  is beats a short one that only hints.
- **By the claim it makes.** A name like `default`, `common` or `simple` is true
  only while the code keeps it true, and the name doesn't change when the code
  does.
- **Against its siblings.** A qualifier says what sets this one apart: when
  every config comes from a file, `FileConfig` tells none of them apart.
- **As a mechanism.** A mechanism is named for what it does, not for the feature
  that first needed it: `retry_queue`, not `upload_retries`.
- **In its context and its family.** One word can serve two meanings when the
  call site tells them apart. A rename keeps the pattern its siblings share:
  beside `ReadError` and `WriteError`, not `SeekFailure`.

For a language with a reference below, its naming reference has the words that
language uses for each of these.

## Types and state

**Make invalid states unrepresentable.** Shape a type so that every value it can
hold is a state the domain allows. Every other value is a check some caller has
to remember, and the caller that forgets meets the bad state far from where it
was made. Make a classification the code branches on an enum, not a string, a
flag or a bool parameter: a match is checked for every case, and
`render(doc, Layout::Print)` says what `render(doc, true)` doesn't. A value
checked again at each use becomes a type checked once, where the data enters.
Leave a condition to a check at the point of use only when the type can't carry
it: one the type's own operations can break, or one that holds only relative to
something outside the value.

The states a value passes through over time count too. A method fails on its
arguments, never on the object's history. Instead of a `connect()` method and a
`send()` that fails before it, a constructor connects and returns the
connection.

**An operation does what its name says, or fails.** A `create` that finds the
thing already there, or a `remove` with nothing to remove, returns an error
instead of quietly doing something else, which would hide the caller's mistake.
Refuse an input the code doesn't act on, since accepting it promises a meaning
it doesn't have, but never refuse an input that is merely awkward. A caller that
wants either outcome uses an operation named for it, such as `get_or_insert`. An
operation that has to tolerate retries says so in its contract.

**One fact, one home.** Each piece of state lives in one place, and every other
place works it out or is handed it. A second copy can disagree with the first,
and the code that keeps them in step, such as a check that two values agree or
`draw(rows, rows.len())`, exists only because of the copy. A decision written as
a constant is state too, so give it one home a reader can find. Two values that
only happen to match, such as two thirty-second timeouts, are separate state,
and a computation written twice holds none.

**Siblings share one shape and one path.** Things that play the same role are
represented the same way and reached by the same code. A second handler goes in
the table the first is in, not in a special case. A `reset` that rebuilds what
the constructor builds replaces the value with a new one instead.

**Spot a type not yet written.** When the same few values travel together from
function to function, or the same check is written at each call, they are a
type: the values its fields, the functions its methods, the check its invariant.
A parser's input, position and errors handed to every parse function are the
parser. Name the type for what the group is.

## Abstractions

An abstraction (a module, trait, shared type, generic or helper) trades what a
caller has to know about the body for what it has to know about the interface.
It earns its place when a reader of each caller needs to know less afterwards,
which happens when its interface is much smaller than what it hides.

**Read the call with the body hidden.** If the name and arguments tell the
reader what this caller gets, what it changes and how it can fail, the
abstraction works. If they have to open the body to find out, the abstraction
hides something its caller needs: `merge(base, overrides)` leaves them asking
which side wins, and `overrides.apply_to(base)` answers it. Two functions that
keep sending you into each other are one piece of reasoning cut in two.

**Delete it and see what comes back.** Inline the abstraction into each caller.
When what comes back is a decision every caller now has to get right, such as a
rule, an order of steps, a shared value, a way to fail or a likely change, the
abstraction stays: `with_retry` comes back as a backoff schedule every caller
must agree on. When what comes back is plain lines each caller reads easily, it
goes, like a wrapper whose methods each forward one call. A wrapper that adds a
meaning stays however thin it is: delete `UserId(Uuid)`, and any `Uuid` can
stand in for a user's id.

**Join code only when it changes for the same reason.** Code that reads alike is
one thing only when changing one copy without the other would be wrong. A log
line's date format and the one another program parses may match today and differ
tomorrow. When a shared helper keeps gaining parameters or branches so that one
caller can differ, put its body back into each caller, and keep only what they
really share. Cut a helper at the general case its callers share, and name it
for that, not for its first caller's case. A helper several callers need goes
where they will find it, such as a method on the type they already hold.

**Make a boundary before its second caller only for a reason that exists now.**
A trait with one implementation, an injected dependency or a generic costs every
reader today. It is worth that when something already varies across it, such as
two implementations or a test that needs a stand-in for an external system, or
when the project has already settled on the second case. An imagined future
caller is not a reason. A generic is for types that share one concept's
invariants and operations, not for types that only look alike. Judge a library's
exported item by what it does for callers outside the tree, even when only tests
use it inside.

**Use the standard library's interface first.** For a conversion, an order,
iteration, display or parsing, use the form the language's standard library
already has. Every reader and every library already knows it, and an interface
of your own is one more to learn. When an existing library already does the job,
adding it is the user's decision: name the library, what it buys and what it
costs.

**Tests are callers.** A test that has to build a module's private parts, or
check its internal state, to reach a behavior shows that the interface is the
wrong shape: change the abstraction, not the test. When shallow pieces merge
behind one deeper interface, delete their tests once tests exist at the new
interface.

## Language references

Before writing or judging code in Rust or Dart, read each of that language's
references whose topic the change touches. Read them before you start, not when
a question comes up: the moment a reference would have answered passes unnoticed
by someone who hasn't read it.

Rust:

- `references/rust-organization.md`: files, modules and where to cut them.
- `references/rust-invalid-states.md`: refined types, enums and typestate.
- `references/rust-semantic-types.md`: newtypes and std types over primitives.
- `references/rust-errors.md`: typed errors and what their messages say.
- `references/rust-api-boundaries.md`: borrowing and ownership at boundaries,
  returning values instead of out-parameters, and the order of parameters.
- `references/rust-iterators.md`: what an iterator holds.
- `references/rust-conversions.md`: constructors, the conversion traits and
  std's trait for each shared capability.
- `references/rust-naming.md`: the words for getters, lookups, searches,
  predicates, conversions and variants.

Dart:

- `references/dart-organization.md`: libraries, privacy and where to cut them.
- `references/dart-invalid-states.md`: class modifiers, sealed families,
  exhaustive switches and fields set too late.
- `references/dart-semantic-types.md`: extension types, wrapper classes and core
  types over primitives.
- `references/dart-errors.md`: exceptions, errors and what they carry.
- `references/dart-api-boundaries.md`: parameters, copies and views at
  boundaries, and records instead of out-parameters.
- `references/dart-iterators.md`: lazy iterables that run again on each pass,
  and streams.
- `references/dart-conversions.md`: constructors, parsing and the core library's
  interfaces.
- `references/dart-naming.md`: the words for getters, lookups, searches,
  predicates, conversions and variants.
