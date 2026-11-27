# Doc comments

A doc comment is read by someone who calls the item and won't read its body.
It states the item's contract: what a call gives the caller, what the caller
must do first, and what can fail. It says nothing about how the body does its
work.

The rules below are written for Rust. Go, Python, Java, C#, Swift and
TypeScript each have a short file in this directory that says how they differ.

## What counts as contract

A behavior is part of the contract when the body couldn't change it without
breaking a caller that uses the public API correctly. A behavior the body
could change freely is mechanism, even when it is true today, and the doc
leaves it out. Before you write a sentence, find a caller, a test or a
recorded decision that relies on the behavior it describes. That is the
evidence that the behavior is contract. If you find none, leave the sentence
out.

## The summary

The first sentence is the only text that an index, a search result or an
editor tooltip shows. To test it, ask: if this line were the only text shown,
could the caller tell that this is the item they want? Say what the item is
for, in the caller's terms. A summary that restates the signature fails the
test, because the index already shows the signature.

```rust
/// Appends an element to the back of a collection.
pub fn push(&mut self, value: T)

/// Pull some bytes from this source into the specified buffer,
/// returning how many bytes were read.
fn read(&mut self, buf: &mut [u8]) -> io::Result<usize>;
```

## The four slots

After the summary, a doc can hold four kinds of sentence, called slots. Write
a slot only when the summary and the signature don't already cover it:

- **Obligation.** What the caller must make sure of before the call.
  *"`buf` must be initialized before calling `read`."*
- **Guarantee.** What is true when the call returns, on every path.
  *"`0 <= n <= buf.len()`"*
- **Failure.** Which condition causes which error or panic, and what is true
  of the state afterwards. *"If an error is returned, no bytes were read."*
- **Invariant.** What stays true across calls, or what the type promises
  about every value of it.

Write an obligation as the bound the caller must stay within. Leave out the
arithmetic or the encoding the bound comes from.

A doc is complete when a caller can write a correct call from it without
reading the body. Make it as long as that takes and no longer. State each
promise once, in the terms of the caller's question, rather than as a list of
everything the promise involves. For example, "The record is loaded from the
store" is the promise. The fields, the ID and the child records that loading
fills in are what "loaded" means, and each is documented on the type that
defines it.

A doc states what a caller wouldn't assume, and leaves out what they would.
A caller already assumes, for instance, that a call doesn't delete a record
whose ID is passed to it, and that a lookup that finds nothing changes
nothing. When you
can't decide whether a sentence belongs, cut it. A missing sentence costs one
caller a read of the body. A sentence nobody needed costs every reader the
time to read it.

A doc may say what the item is for and how it is meant to be used. The
`std::sync::Mutex` doc, for example, says a mutex is "useful for protecting
shared data". A doc doesn't promise what other code does with the item.

## What a doc leaves out

- **How the body works,** such as an algorithm, a byte layout, an encoding, a
  constant or the order of the steps. A caller who reads about the mechanism
  comes to depend on it, and the sentence becomes false when the body
  changes. When callers would assume some mechanism anyway, say that it isn't
  guaranteed. The `Vec` doc does this: "Vec does not guarantee any particular
  growth strategy".
- **A list of the item's own members.** Rustdoc already lists the variants and
  the fields, and the code shows the rest.
- **An obligation or promise that another item, or the API as a whole,
  already states.** Link to that item once and leave the claim in its doc.
  For example, how a kind of value is created is stated where that kind is
  defined, not on each item that takes one.
- **How other code registers, connects or configures the item.**
- **Sample output,** such as a log line.
- **What other code does with the item,** such as the order a program moves
  through the values of a state enum, or the screen it shows in one of them.
- **History.** What changed and what was removed go in the commit, the
  changelog or `#[deprecated(since = "...", note = "use ... instead")]`.
- **A sentence on a member that only repeats its name.** A `Storage(..)`
  variant on an error enum doesn't need "The storage failed."

## Each fact at its own level

State each fact at one level. When a fact is at the wrong level, move it down
to the item it is about:

- **Module.** What the module is and what it is for, then its items, each
  with a short phrase, as in the `std::net` docs. A crate root or an entry
  module also shows how to use it, with an example, as in the
  `std::collections` and `std::sync::mpsc` docs. After that, a module doc may
  state a fact that no single item can hold, such as an OS race that affects
  every operation.
- **Type.** What a value of this type is, what it is for, and what is true of
  every value.
- **Function.** What a call does, what it guarantees and how it fails.
- **Field.** What the value means, with its unit or range.

```rust
/// Shortens the vector, keeping the first `len` elements and dropping
/// the rest.
///
/// If `len` is greater or equal to the vector's current length, this has
/// no effect.
///
/// Note that this method has no effect on the allocated capacity
/// of the vector.
pub fn truncate(&mut self, len: usize)
```

## Sections

Rustdoc readers scan for these section headings. Use exactly these names, in
this order:

- `# Panics`, for a panic the caller can actually trigger.
- `# Errors`, for a public function that returns `Result`.
- `# Safety`, for an `unsafe fn`.
- `# Examples`, last, because a caller who has what they need stops reading
  once they reach the examples.

## The register

Write plain statements, one claim to a sentence, in the order the caller
needs them. Check a doc against the tells listed in the skill, as you would
any other text. The first doc below has most of the tells at once, and the
second states the same contract plainly.

```rust
// Before
/// Asks the store to load into `target` the record of the kind `kind` it
/// keeps under the key `target` carries.
///
/// `kind` is registered with [`register_kind`], and `target` carries the
/// kind's key and is not loaded yet: the store panics otherwise. Where the
/// store keeps a record under the key, `target` becomes it: it is given every
/// field the store holds of that record, and the record's children are loaded
/// under it. Where the store keeps none, `target` is left as it was. The load
/// ends with a `LoadFinished` on `target`, as that event says.
pub fn load_by_key(&mut self, target: &mut Record, kind: KindId)

// After
/// Loads a record of kind `kind` from the store into `target`, looked up by
/// `target`'s key.
///
/// The store sends [`LoadFinished`] for `target` when the load completes.
///
/// # Panics
///
/// Panics if `kind` isn't registered, if `target` has no key for `kind`, or
/// if `target` has already been loaded.
pub fn load_by_key(&mut self, target: &mut Record, kind: KindId)
```

## Changing an existing doc

Change an existing doc only when it breaks one of the rules above. That means
it has one of these:

- a false claim;
- mechanism;
- another item's contract;
- a fact at the wrong level;
- the machine register.

Remove or correct the sentence that breaks the rule. Add a sentence only for
a summary, an obligation or a failure that a caller must have and the doc
lacks. Leave a doc that passes word for word as it is. A rewrite the reader
learns nothing from only makes the diff bigger, and it brings the machine
register back.

A claim about something outside the code, such as how an OS or a library
behaves, can't be checked against the item. Leave such a claim as it is, and
report it.

## What gets a doc

Every public item gets a doc. An internal item gets a summary, plus an
obligation if it has one. A member whose name says everything about it can go
without a doc. A trait impl gets a doc only when it does something the trait
doesn't promise. Test code gets no doc comments.
