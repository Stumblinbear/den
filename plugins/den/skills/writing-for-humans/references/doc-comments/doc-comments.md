# Doc comments

The reader is a caller who will not read the body. A doc comment states the
item's contract: what a call gives them, what they must do first, and what
fails. It says nothing about how the body does it.

Rust's form is the rule below. A language whose form differs has a short file
at the end; read it too.

## What is contract

A behavior is contract when the body could not change it without breaking a
caller that uses the public surface correctly. A behavior the body could
change freely is mechanism, however true it is today, and it is not written.
A caller, a test or a recorded decision that relies on the behavior is the
evidence that it is contract; before writing a sentence, name one.

## The summary

The first sentence is the only text an index, a search result or an editor
tooltip shows. The test: if this line were all that rendered, could the
caller tell this is the item they want? Say what the item is for, in the
caller's terms. A summary that restates the signature fails, since the index
shows the signature already.

```rust
/// Appends an element to the back of a collection.
pub fn push(&mut self, value: T)

/// Pull some bytes from this source into the specified buffer,
/// returning how many bytes were read.
fn read(&mut self, buf: &mut [u8]) -> io::Result<usize>;
```

## The slots

After the summary, four kinds of sentence, each written only when the summary
and the signature do not already say it:

- **Obligation.** What the caller must ensure first. *"`buf` must be
  initialized before calling `read`."*
- **Guarantee.** What holds on return, on every path. *"`0 <= n <=
  buf.len()`"*
- **Failure.** Which condition gives which error or panic, and what is true
  of the state afterwards. *"If an error is returned, no bytes were read."*
- **Invariant.** What holds across calls, or what the type promises about
  every value of it.

State the obligation as the bound the caller needs, not as the arithmetic or
the encoding that derives it.

A doc is complete when a caller can write a correct call from it without
reading the body. It is as long as that takes and no longer: each promise is
stated once, at the level of the caller's question, never as the list of what
it entails. "The entity is hydrated from the save" is the promise; the
components, the id and the subtree that hydration inserts are what the word
means, owned by the types that define them.

A doc states what a caller would not assume, and leaves the default unsaid:
that an entity handed to a call is not despawned by it, that a lookup that
finds nothing changes nothing. When a sentence is borderline, cut it. A
missing sentence costs one caller a read of the body; a redundant one costs
every reader.

A doc may say what the item is for and how it is meant to be used, as
`std::sync::Mutex` says it is "useful for protecting shared data". It does
not promise what other code does with the item.

## Not in a doc

- How the body works: an algorithm, a byte layout, an encoding, a constant,
  the order of its steps. Leave the mechanism out, because a caller who reads
  it comes to depend on it, and the sentence goes false when the body
  changes. Where callers would assume a mechanism, say that it is not
  guaranteed, as `Vec` does: "Vec does not guarantee any particular growth
  strategy".
- A list of the item's own members. rustdoc lists the variants and the
  fields; the body lists the rest.
- An obligation or promise that another item or the surface as a whole
  already states. Link the item once and leave its claim where it is. How a
  kind of thing comes to exist, for example, is stated where that kind is
  defined, not on each item that takes one.
- How the item is registered, wired or configured elsewhere.
- Sample output, such as a log line.
- What other code does with the item: the order an app moves through a
  state's values, the screen that shows in one.
- History. What changed and what was removed go in the commit, the changelog
  or `#[deprecated(since = "...", note = "use ... instead")]`.
- A sentence on a member whose name already says it. `Storage(..)` on an
  error enum needs no "the storage failed".

## One level, one fact

A fact lives at one level, and a fact at the wrong level moves down to the
item that owns it:

- **Module.** What the module is and is for, then its items by name with a
  phrase each, as `std::net` does. A crate root or an entry module shows how
  the module is used, with an example, as `std::collections` and
  `std::sync::mpsc` do. A fact no item can carry, such as an OS race under
  every operation, may follow.
- **Type.** What one of these is, what it is for, and what holds for every
  value of it.
- **Function.** What a call does, guarantees and fails.
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

The section names rustdoc readers scan for, used exactly and in this order:

- `# Panics`, on a reachable, caller-triggerable panic.
- `# Errors`, on a public fn returning `Result`.
- `# Safety`, on an `unsafe fn`.
- `# Examples`, last, since a caller who has what they need stops reading
  there.

## The register

Plain declarative sentences, one claim each, in the order the caller needs
them, read against the tells in the skill as any text is. The example below
is a doc that has drifted into most of them at once.

```rust
// Before
/// Asks the save to load onto `root` the root of the kind `kind` it keeps
/// under the key `root` carries.
///
/// `kind` is registered with [`register_keyed_persisted_root_kind`], and
/// `root` carries the kind's key and is not persisted: the save panics
/// otherwise. Where the save keeps a root under the key, `root` becomes it:
/// it is given every component the save holds of that root, and the
/// entities under that root are spawned under it. Where the save keeps
/// none, `root` is left as it was. The load ends with a `RootLoadFinished`
/// on `root`, as that event says.
pub struct LoadRootByKey { pub root: Entity, pub kind: PersistedRootKindId }

// After
/// Loads a persisted root of kind `kind` from the save onto the `root`
/// entity, looked up by the key component `root` carries.
///
/// `kind` must be a registered persisted root, and the given `root` entity
/// must not have already been loaded, otherwise it will panic.
///
/// The given root entity will have its components and subtree hydrated from
/// the save if it was found. [`RootLoadFinished`] is fired on the root
/// entity when loading completes.
pub struct LoadRootByKey { pub root: Entity, pub kind: PersistedRootKindId }
```

## Changing an existing doc

A doc is changed only when it breaks a rule above: a false claim, mechanism,
another item's contract, a fact at the wrong level, or the dialect. Remove the
sentence that breaks the rule, or correct it. Add a sentence only for a
missing obligation, failure or summary that a caller must have. A doc that
passes stays word for word, since a rewrite the reader learns nothing from
only grows the diff and puts the dialect back.

A claim about something outside the code, such as how an OS or a library
behaves, cannot be checked against the item. Leave it and report it.

## What gets a doc

Every public item. An internal item gets a summary, and an obligation if it
has one. A member whose name says all it is may go undocumented. A trait impl
gets no doc unless it does something the trait does not promise. Test code
gets none of this.

## Other languages

- `go.md`: first-sentence summary beginning with the item's name; the package
  comment as the package's own orientation; contract in prose, no headings;
  `Deprecated:`.
- `python.md`: docstring, imperative summary, `Args`/`Returns`/`Raises`.
- `java.md`: summary is a sentence fragment; block tag order; never an empty
  tag.
- `csharp.md`: tags delimit the summary; `<param>` coverage and `cref` targets
  are compiler-checked.
- `swift.md`: summary is a sentence fragment; callouts for the slots.
- `typescript.md`: the summary is everything before `@remarks`, so the
  contract goes under `@remarks`.
