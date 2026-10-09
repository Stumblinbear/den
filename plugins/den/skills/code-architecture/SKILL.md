---
name: code-architecture
description: Where a new type, function, or module belongs, whether a file is still one concept, whether an abstraction, a module, a helper, a type or a generic, earns its place, and whether a type can represent states that should not exist.
when_to_use: ALWAYS invoke this skill before designing, sketching, reviewing, judging the quality of, deciding anything about or writing out any code, for any reason, an existing type or function included, so a type's shape is checked when it grows and not only when it is placed. Do not think through or show code directly; use this skill first.
user-invocable: false
---

# Code architecture

Apply each rule by its reason: where the reason reaches the case in hand, the
rule holds whatever the case is called, and where it does not, neither does
the rule.

## The core, in any language

**One concept per file.** The question comes up when you add a type or
function to an existing file, write a banner comment (`// ---- helpers ----`)
to divide one, or scroll past unrelated code to reach the code you came to
change. Ask what the file is about. A concept is the thing you would name in
answer, and an answer of "X and Y" is two files. To tell whether two pieces
are one concept, look at what binds them. A concept is the smallest unit that
would lose coherence if you broke it apart, and two things hold a unit
together. One is private state: fields one piece keeps for the other, or an
invariant the two uphold together. The other is a change that always reaches
both: a piece with no reason to change but the other's, as an error enum's
`Display` matches each variant and changes whenever a variant is added, or
two phases of one pass. Two pieces bound by neither are two concepts however
closely their subjects are related. A type and the iterator that walks its
private buffer are one concept, and so are an error enum and its `Display`,
though the `Display` reads nothing private. A parser and a formatter for the
same syntax both use the public tree and nothing private of each other's,
and each changes for reasons of its own, error recovery in one and line
layout in the other, so they are two, even though a node added to the tree
reaches both. A banner comment is a file naming its own concepts.

The question comes up again when a split reaches for a name the other file
keeps private, by keyword or by convention. Where that name is state, the
reach shows the two pieces share it, so the cut ran through a concept.
Widening it, or reaching past the convention, keeps the invariant in two
files, and nothing beside the field shows the second. Move one side instead,
the code reaching in beside the field or the field beside the code that
keeps it. A type or helper that keeps its own invariant is not shared state
but the interface the other side calls.

**Find the seam, not the line count.** When a file needs splitting, or is
large enough to prompt the question, count its concepts: the count decides,
not the length. Cut where two concepts meet:

- a distinct mechanism, such as a data structure beside the algorithm that
  uses it;
- a separate concern axis, such as serialization beside validation;
- independent top-level types that share no private state.

A cut there leaves each side keeping its own invariants whole. A cut through
a concept's shared invariants leaves neither half able to keep them alone, so
one half reaches into the other: the coupling the split was meant to remove,
now across a file boundary. Two halves of equal length are not a seam, and
one concept stays in one file at whatever size: one trait's impls for a dozen
tuple arities run long and are one concept, where a file of the same length
holding a cache and the HTTP client that fills it is two.

**Module roots are tables of contents.** The question comes up when you are
about to put code in a module's root file because it fits nowhere else. The
root declares the module's children and re-exports its public surface, so a
reader who opens it learns what the module offers without reading an
implementation. Code that "doesn't fit anywhere else" is a concept that has
no file yet, and left in the root it makes the root the module's dumping
ground. Ask what the code is, name it, and give it a file under that name. A
few lines of glue wiring the children together stay; a helper the children
share is a concept of its own.

**Name a thing for what it is.** You decide a name when you create a module,
type, field or function, and again when a review asks whether a name still
fits. Ask what the thing is, specifically, and answer:

- in the domain's terms and the vocabulary its siblings already use;
- with its role in the name: an identifier is an `Id`;
- for a function, by what it is: one that acts takes the verb its language or
  framework already gives it (`insert`, `remove`, `open`); one that returns a
  value it holds or derives cheaply is named for the value (`len`, `parent`);
  one that looks a value up by a key and may find none says so in the way its
  language does, returning the absence rather than failing (`get(key)`); one
  that searches by a condition says so too (`find`); a count is named as a
  count; one that answers yes or no reads as a claim about its subject
  (`is_empty`, `contains`). These are different things, so one of the shapes
  applied to all of them misnames the rest: a keyed lookup called `user(id)`
  reads as a property that is always there. A bare state word, `drawing`,
  `covered`, `enabled`, names no action, no value and no subject, so it is
  none of these. The language's references name its words.

Name the thing, not the category it belongs to or what it resembles: `tree`,
not `data_structures`. A generic name is the reader's first guess made
permanent and the next writer's dumping ground, since anything fits under it.
Then check the name against how it will be read:

- **At the call site.** Most readers meet a name where it is called, with the
  body unseen, so check it there: does the call tell them what it does?
  `cleanup(jobs)` sends the reader into the body; `drop_expired(jobs)` does
  not.
- **Where it is imported.** A public item is read in an importer's file, away
  from its siblings. `ParseError` reads plainly in a config module and names
  nothing among an importer's imports, where `ConfigParseError` does.
- **By the claim it makes.** A name that makes a claim, `default`, `common`,
  `simple`, holds only while the claim is true, and the name does not change
  when the code does. Ask whether the code will keep the claim true:
  `simple_layout` stops being simple the day it gains a second mode.
- **Against its siblings.** A qualifier names what sets the thing apart from
  its siblings. Where every config is read from a file, `FileConfig` tells
  none of them apart; the qualifier is what this one has that the others
  lack.
- **As a mechanism.** A mechanism module carries no domain knowledge, and a
  mechanism is named for what it does, not for the feature that first needed
  it. A queue that retries failed jobs, written for uploads, is
  `retry_queue`, not `upload_retries`, since its next user will not be
  uploading. A mechanism that needs domain types is part of that domain.
- **Within its context.** A word is distinct within its context, not across
  the codebase. Where the call site tells two meanings apart, one word serves
  both, and a synonym only gives the reader a second word to learn. Where a
  map's `entry` and a log's `entry` are both a bare `entry` in one body and a
  line no longer says which, one of them wants another word.
- **Within its family.** A rename keeps the pattern its siblings share. Where
  `ReadError`, `WriteError` and `SeekError` sit together, renaming one to
  `SeekFailure` to dodge a clash breaks the family, and the reader looks for
  a difference that is not there.

**Make invalid states unrepresentable.** Organization decides where code
lives; type design decides which states can exist at all. The question comes
up when you define or extend a type, and whenever you write a check that a
value is valid. Ask whether every value the type can hold is a state the
domain allows. Each value it can hold that the domain does not is a check
some caller must remember, and the caller that forgets meets the bad state far
from where it was made. So shape the type until the set of constructible
values approximates the set of valid domain states.

A classification the code branches on is an enum or a constructor, an error
included, never a string, a flag, a bool parameter that picks a kind, or a
field that is "not yet". A match over an enum is checked for every case, and
a new kind breaks each match that misses it; nothing checks a string.
`render(doc, true)` tells the reader of the call nothing and leaves no room
for a third kind, where `render(doc, Layout::Print)` does both. A value
re-checked at each use, or ranged by its encoding rather than its domain,
becomes a refined type checked once where the data enters;
`references/rust-invalid-states.md` teaches how.

The case the other way is a condition the type cannot carry: one the type's
own operations can break, such as a queue that must be non-empty and is then
popped, or one that holds only relative to something outside the value, such
as an index valid for one particular list. Check that where it is used.

The states a value passes through in time count as much as the combinations
of its fields. That question comes up when a method needs to know what has
happened to its object: a field that is "not yet", a flag recording which
constructor ran or which method has been called, an error saying the object
is not ready. A value exists only once what it needs has happened, so a
method fails on its arguments and never on the object's history. A connection
with a `connect()` method and a `send()` that fails before it becomes a
constructor that connects and returns the connection, and a `send` that can
never meet an unconnected one; the phase before belongs to whatever drives it.

**An operation does what its name says, or fails.** The question comes up
when a `create`, an `add` or a `remove` meets a case its name does not cover:
the thing already exists, or is absent. Ask what the caller asked for, and the
name is the answer. A success that quietly did something else, a create that
returns the existing one or a remove of nothing, guesses what the caller
meant and hides the caller's mistake, which then surfaces further from its
cause. So the caller gets an error and decides. Input the code does not act on
is refused for the same reason: accepting an option the code ignores promises
the caller a meaning the option does not have. The refusal covers what the
code does not act on, never what is merely awkward, and a refusal of a
legitimate input is a defect. A caller that wants either outcome picks an
operation whose name says so, `get_or_insert` or `ensure_dir`. An operation
that must tolerate retries, such as a handler fed by a queue that redelivers,
says so in its contract, and its remove of nothing is then what the contract
promises.

**One fact, one home.** The question comes up when you write a value some
other site already knows, or a check that two values agree. A fact is a
decision the code makes; ask what thing it is a property of. It is stated
once, on that thing, and every other site derives it or is handed it. A
second copy is the decision written again, and the first change that reaches
one copy and not the other makes the code wrong. The check you are about to
write is the tell, and each of these is a second copy:

- a comparison of two values from one source;
- a parameter beside the value it came from, as in `draw(rows, rows.len())`;
- a fact read before the code that needs it runs and then guarded, since the
  guard exists only because the early copy can go stale;
- a setting copied into each record it produced;
- a condition at a distance restating a fact the code already states.

A number that decides an outcome and lives in no setting is a fact with no
home: a reader looking for the decision cannot find it. What reads alike
without sharing a decision is not a copy. A database timeout and an HTTP
timeout that happen to be thirty seconds are two facts, because changing one
leaves the other right; a client timeout that must stay under the server's
idle timeout is one decision written twice.

What the one home is worth paying for depends on how quietly the copies can
drift apart. Where a site can compute the value from something it already
holds, it derives it: that costs nothing and cannot go stale. Where the
copies sit in different files, crates or languages and nothing would notice
them disagreeing, a small mechanism that hands the value across is worth it:
a size limit a server enforces and its client in another language checks
again is read from the server or from one generated file, not restated.

**Siblings share one shape and one path.** The question comes up when you add
a peer to things that play one role, write a type that keeps the invariants
and operations of one that exists, or write a second way to reach a state the
code already reaches. Things that play the same role are represented the same
way and reached by the same code. One handler registered in a table and
another special-cased in a `match` are two peers stored as different kinds; a
`reset` that rebuilds, field by field, what the constructor builds is a second
path to one state. Each is one thing twice, and the second must mirror the
first forever. The second handler goes in the table, and `reset` replaces the
value with a newly constructed one.

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

**Read the call with the body unseen.** The question comes up when you write
a call to something new, and when you catch yourself opening a function to
understand the line that calls it. Write the call as it will appear and read
it as someone who has never opened the body. If the name and arguments tell
them what this caller gets, what it changes and how it can fail, they can
trust it and read on: the abstraction has replaced a body with something
smaller. If they must open the body to know what this caller does, what
exists afterward, which value wins, what order things happen in, the
abstraction hides something its caller needs: the reader still needs all of
it, one jump away, under a name that told them to skip it. `merge(base,
overrides)` leaves the reader asking which side wins a conflict;
`overrides.apply_to(base)` answers it. A body that says no more than its name
adds the jump and nothing else. The same holds between any two functions:
when following one keeps sending you into the other, they are one piece of
reasoning cut in two.

**The deletion test: imagine deleting it and ask what comes back.** An
abstraction pays for itself by hiding a decision: a rule that must hold, an
order steps must run in, a value several places must agree on, a way the work
can fail, a choice likely to change. Inline its body into each caller. If
what comes back is that decision, held now by every caller and each one a
place to get it wrong, the abstraction was earning its keep. If what comes
back is lines each caller reads plainly on its own, nothing was hidden, and
each caller reads better whole. A `with_retry` helper comes back as the
backoff schedule and the attempt limit in every caller, a decision they must
agree on, so it stays. A wrapper type whose methods each forward to one call
on a field, with no invariant of its own to keep and no meaning beyond its
field's type, comes back as those calls, so it goes. A wrapper that adds a
meaning hides that distinction: delete `UserId(Uuid)` and what comes back is
IDs any `Uuid` can stand in for, so it stays however thin its methods are.

**Ask whether the callers want the same thing for the same reason.** The
question comes up when you join two pieces of code because they read alike,
and when you add a parameter, or a branch on which caller called, to a shared
function so one caller can behave differently from the rest. Code that reads
alike is one thing only when it changes together: when changing one copy and
not the other would make the program wrong. A date formatter for log lines
and one for a file another program parses can read identically today and
answer to different readers tomorrow. Joining code that answers to different
reasons ties together callers that had no reason to know of each other, and
each change one of them needs arrives as a parameter or a branch in the
shared body that keeps the others as they were, moving that caller's
behaviour to a place none of them shows. The branches belong in the callers,
and the helper holds what is the same for all of them; when a helper keeps
gaining parameters whose only purpose is to let one caller differ, put its
body back into each caller, keep what that caller uses, and look again at
what they share.

A helper is cut at the general case its callers share and named for it, not
at the first caller's case. A wait for "the first job finished", written for
one test, is a wait for the job with an id, with that test choosing its id;
promoted as written, it is a general-sounding name over one caller's accident,
and the next caller either misuses it or writes another. A helper one caller
needs stays in that caller. One that several need lives where they find it:
as a method on the type the callers already hold, found by typing a dot after
it, rather than a free function beside one of the callers, which is found only
by reading that caller.

**A boundary made before its second caller needs a reason that exists now.**
The question comes up when you add a trait whose only implementor is the
production type, an injected dependency, or a generic parameter. Each pays
its cost today for flexibility used later. Something already varying across
it is that reason: two implementations, or a test that needs a stand-in for
an external system. A requirement already settled for the project is too,
before the second implementation exists. Name the obligation, what the
boundary costs now, and whether something simpler meets it; an imagined
future caller alone is not a reason. A clock trait whose test implementation
stands in for real time meets an obligation today. A storage trait with one
implementation, which the tests also use, costs every reader an indirection
and meets none, unless a second backend is already settled. A generic over
types that only look alike is judged the same way: types that share one
concept's invariants and operations make a good generic, types that share a
shape do not, and its signature is one more thing every reader parses. A
library's callers are outside the tree, so an exported item only the tests
exercise is the product, judged on its depth and the obligation it meets,
not on how many in-tree callers it has.

**Tests are callers.** Tests cross the same interface callers do. The
question comes up when a test needs to build a module's private parts, or
assert on its internal state, to reach behaviour the interface does not
expose. That test is a reader who needs something the interface hides: the
abstraction is the wrong shape, and the change belongs in the abstraction,
not the test. When shallow pieces merge behind one deeper interface, the
tests of the pieces test interfaces that no longer have callers; once tests
exist at the new interface, delete the old ones.

## Language-specific guidance

The references below hold a language's concrete thresholds, idioms and
mechanisms, which the rules above leave out so they hold in any language.
Before writing or judging code in that language, read every reference whose
topic the change touches, as part of applying the rules rather than when a
question comes up, since the moment a reference would have answered passes
unnoticed by a reader who has not read it.

### Rust

- `references/rust-organization.md`: files, modules and where to cut them.
- `references/rust-invalid-states.md`: refined types, enums and typestate.
- `references/rust-semantic-types.md`: newtypes and std types over primitives.
- `references/rust-errors.md`: typed errors and what their messages say.
- `references/rust-api-boundaries.md`: borrowing and ownership at boundaries.
- `references/rust-conversions.md`: constructors and the conversion traits.
- `references/rust-naming.md`: the words for getters, lookups, searches,
  predicates and conversions, from the API guidelines and std.
- `references/sources.md`: the sources behind the Rust references.
