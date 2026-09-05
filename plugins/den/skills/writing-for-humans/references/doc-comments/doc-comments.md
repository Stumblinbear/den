# Doc comments

The reader is a caller who will not read the body. The comment owes them what
the body would have told them and the signature does not; it owes them nothing
for what the signature already shows.

Rust's form is the general rule below (concise, complete, free of filler), and
the shape generalizes. Where a language genuinely differs, its delta is a short
file listed at the end; read that one too before writing.

## The summary

The first unit (the first sentence in Go and Java, the `<summary>` tag in C#,
the first paragraph elsewhere) is the only text that exists in an index, a
search result, or an editor tooltip. rustdoc reuses everything before the first
blank line in searches and module overviews; C# feeds `<summary>` to
IntelliSense; javadoc puts the first sentence in class and method indexes;
Python's indexing tools take the first line of the docstring.

That render fact gives the test: **if this were the only text that rendered,
could the caller tell whether this is the item they want?**

A summary that restates the signature fails it: the reader scanning an index
has the signature already. It is the commonest doc-comment failure, and the one
usually traded against padding. Write what the item is for, in the terms the
index reader has:

```rust
// Vec::push
/// Appends an element to the back of a collection.

// io::Read::read
/// Pull some bytes from this source into the specified buffer,
/// returning how many bytes were read.
```

Put the blank line where the index entry should stop. A fact that only makes
sense after the paragraph below it goes below it.

## The contract, not the body

The completeness test: the doc gives enough information to write a call to the
function without reading the function's code.

Four slots. Decide for each whether it is non-trivial for this item, and write
the ones that are:

- **Obligation.** What the caller must ensure before calling, or must not do.
  *"It is your responsibility to make sure that `buf` is initialized before
  calling `read`."*
- **Guarantee.** What holds on return, that other code may rely on.
  *"implementations must guarantee that `0 <= n <= buf.len()`"*
- **Failure.** Which condition yields which error, panic, or abort, and what
  is true of the state afterwards. *"If an error is returned then it must be
  guaranteed that no bytes were read."*
- **Invariant.** What holds across calls or across sites: ordering, the scope
  of a returned guard, what the type promises about itself.
  *"Implementations must not retain p."*

A slot the signature answers needs no line. A non-trivial slot left unwritten
is the gap that sends the caller into the body, and at that point the doc is
decoration.

State a slot **as the obligation** (what the caller must ensure), not as the
arithmetic or encoding that derives it. The derivation is the body; the caller
needs the bound.

Keep the body's mechanism out: a doc that names the sorting algorithm makes the
algorithm harder to change, because callers now depend on what you wrote. The
same holds for constants, encodings, and buffer layouts.

Keep out, too, the implementation that does not exist: "a naive version would
deadlock here". `references/inline-comments.md` carries that rule for both
comment kinds, and two exceptions to it; the one that reaches a doc comment is
the failure a non-obvious rule prevents, stated in one present-tense sentence
as the reason the rule exists.

## Length is layering, not a budget

No standard sets a length limit, and length tracks contract size: a four-line
doc and a forty-line doc are both right when that is the size of the contract.
Interface documentation has to be complete: a cap on it just relocates the
cost to every caller who now reads the body.

Layer instead, so a reader who has what they need can stop: summary, then the
contract, then failure sections, then an example, then advanced detail.

The one bounded region is the undifferentiated prose between the summary and
the first heading, because it is the only part a scanning reader cannot skip
into. Bound it by content, not by lines: anything a section heading owns goes
under that heading. That prose is legitimately long when every paragraph of it
is contract that no standard heading covers.

## Sections

Fixed names are scan targets. Use the established name exactly; a heading
called "Failure modes" is invisible to a reader looking for `# Panics`, and
rustdoc renders these into the sidebar.

The Rust vocabulary: `# Safety`, `# Panics`, `# Errors`, `# Examples`,
`# Time complexity`. Async code adds `# Cancel safety`, a tokio convention
rather than a standard, on a public async fn a caller could race in `select!`.

- `# Errors` on every public fn returning `Result`.
- `# Panics` on a reachable, caller-triggerable panic.
- `# Safety` on every `unsafe fn`, stating the caller's obligations.

Order: everything the caller needs in order to call correctly comes before
`# Examples`, because a caller who is satisfied stops reading. Reference
material they consult after deciding may follow it, as `# Time complexity`
does.

## Examples

Give a public item an example: at least one snippet the caller can copy and
paste to try it.

Write it as code someone will paste verbatim, because they will. In Rust it is
also a doctest, which makes it the one part of a doc the compiler keeps
honest, so use `?` rather than `unwrap`, and mark it `no_run` when running it
needs live infrastructure.

## History belongs in the markers

Prose states what is. History has a sanctioned home (the markers the toolchain
parses), and putting it there buys tool behavior that a sentence in prose does
not: in Rust, `#[deprecated(since = "...", note = "use ... instead")]` for a
thing on its way out and `#[stable(since = "...")]` for the version one landed
in. Every toolchain has its own; where the form differs, the language file
below carries it.

Every one of those markers wants the replacement named, so name it.

## Links

Link the first mention of another item, and only to a target that exists.
rustdoc warns on an intra-doc link it cannot resolve and the C# compiler warns
on a `cref` it cannot find, so an invented link costs a build warning rather
than passing silently.

Link to related items; do not relocate the contract into them. Documentation
scattered across pages and references costs the caller three hops to learn what
they must guarantee, which is three chances to stop before they have it.

## When the contract will not fit

An interface comment that has to be very long to be complete is a signal about
the abstraction, not about the comment. Ask which produced the length:

- **Restatement.** Mechanism, constants, one caller's usage narrated onto a
  general operation. Cut it; it was never contract.
- **Contract.** Every paragraph is something the caller must know. Keep all of
  it, and treat the size as a design finding: the item is probably doing two
  things, or leaking state its callers have to track.

Truncating a complete contract does not fix the abstraction; it hides the
measurement.

## What gets a doc comment

Every publicly visible item. Full treatment on the public API surface; for an
internal item, the summary plus any non-obvious obligation.

Nothing on this page reaches test code: a `#[cfg(test)]` module, a `tests/`
tree, or a language's equivalent, and every item inside one, a helper as much
as a test. None of it appears in an index, and its callers are the tests beside
it, so it answers to the skill body's common rules alone.

A simple, obvious member may go undocumented when there really and truly is
nothing else worthwhile to say. An override inherits its supertype's
documentation; restating it there is a second copy to keep in sync.

## Other languages

Read the file for the language in hand; each is short and states only its delta
from the above.

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
