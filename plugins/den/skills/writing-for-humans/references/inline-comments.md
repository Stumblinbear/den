# Inline comments: inside a function body

An inline comment is read by someone editing that body, with the code in front
of them. It earns its place by what the adjacent code does not give that
reader, carried one level above the code — which is why a higher-level *what*
qualifies as readily as a *why*.

## The bar

- **The reconstruction test.** Could someone who has never seen this code write
  your comment from the lines next to it? If yes, delete it — the reader
  already has it. Judge by whether the adjacent code yields the comment, not by
  whether the comment's words resemble the operation; the worked judgments
  below turn on that distinction.
- **One level up.** The comment and the code sit at different altitudes, and
  the comment is usually the higher one: the block's overall intent rather than
  its steps. The payoff is that the reader can judge whether the code does what
  it set out to do, which a line-by-line paraphrase never allows.
- **The reader knows the language and the repository.** Anything they get free
  from either buys nothing: describe what the code does only where the behavior
  is non-obvious to someone who knows the language well.

## The kinds that clear it

1. **Block and loop summaries.** In a function long enough to have phases, a
   line above each phase saying what that phase does; above a loop whose job is
   not obvious, a line saying what one iteration does. This is routine for any
   long function, not a reward reserved for deep machinery, and it is the
   highest-volume legitimate kind.
2. **Invariants and ownership.** Which field is authoritative and which is
   derived, the locking discipline several operations must preserve, what the
   surrounding code must already hold — beside the code that enforces it. This
   is the class that bites: lock-related and call-ordering comments are where
   real bugs hide behind stale text.
3. **Ordering and causality.** Why this must happen before that — a barrier, a
   batching or correlation constraint, a state transition that must not be
   reordered. A memory barrier earns a line every time for exactly this reason.
4. **The code-janitor guard.** Anything that might tempt a future reader into
   an incorrect "cleanup" gets a line saying why it is done this way. This is
   the one kind that licenses naming an edit nobody has made yet.
5. **A reason that lives outside the code.** Binary size, a hardware quirk, a
   spec clause, a benchmark result, the upstream bug report that forced the
   shape. No name and no refactor can carry these; without the line the reason
   is gone.
6. **Necessary indirection.** An adapter, queue, index, or normalization pass
   whose structural role — what it sits between, what it indexes — is not
   apparent from its signature. A reader can follow every line of such a pass
   and still not see why anything needs it.

## Rename, extract, or comment

- **A fact that is a name belongs in a name.** What this value is, what this
  predicate tests: rename the variable, field, or function. The reader scanning
  top-down gets a name at every use site and a comment only once. A comment
  explaining a double-negative `result` disappears when the variable becomes
  `matchfound`.
- **A fact that is a relation or an external reason belongs in a comment.**
  Ordering between two sites, an invariant spanning operations, ownership, a
  reason outside the code. No identifier holds these, so the choice is the
  comment or nothing.
- **Extraction is not renaming.** Pulling a single-use expression into a new
  function to hold a name buys the name at the price of a jump, which a reader
  going top-down pays every time, and it multiplies shallow functions.
  Extract when the extracted thing is a concept used more than once or worth
  naming in its own right (`IsAlreadyProcessed`); otherwise name a local, or
  leave the expression and put one line above it.

## Placement

- **Narrowest scope.** Push each comment down to the narrowest scope containing
  all the code it refers to. A correct comment hoisted to the top of a function
  makes the reader hold it until they reach the code it guards, and up there it
  is the least likely to be updated when that code changes.
- **Above the block, on its own line.** A trailing comment can only be about
  the one line it trails, which drags it down to the code's altitude — the
  repeat-the-code failure is a column of them.
- **The top of a function is for the phase map.** `We proceed in three phases:`
  and one line per phase, with the detail for each phase pushed down to it.
- **Distance and altitude move together.** The farther a comment sits from the
  code it describes, the more abstract it must be; that is also what makes it
  cheap to maintain, since minor edits no longer invalidate it.

## One master comment, short pointers

Document a decision once, in the single place a developer will land — usually
the declaration of the variable, type, or enum the decision hangs on. At each
other affected site, write a one-line pointer naming that place
(`See the comment on Status for why this list must stay sorted.`).

The reason is failure behavior, not tidiness: a pointer that breaks is
self-evident, because the reader goes to the named place and finds nothing,
and version control tells them what happened. A duplicate that goes stale
announces nothing and is believed.

A site a future editor could break still gets its line. Make that line the
pointer rather than a second copy of the reasoning.

Rust `// SAFETY:` is the exception. It is a per-block obligation that clippy's
`undocumented_unsafe_blocks` expects at every `unsafe` block, so near-identical
texts at neighbouring sites are correct. Write them per `den:unsafety-author`;
never consolidate them into one master comment.

## Shape: aim at the one-liner

One line is the target. Four is already long, and eight lines is the ceiling —
a boundary, not something to fill. Past it, shrink the comment to the rule it
arrives at, or move it up: to the item's doc comment, or the module's. Length
that earns its place lives above the function rather than inside it: a long
comment is a function prologue at column 0, with one-liners inside the body.

## Counterfactuals: the guard, not the defense

Describe the code that exists, not one that does not — in a doc comment as much
as in a comment inside a body. "A naive version would deadlock here" defends a
change instead of stating what is, and it goes stale against a body it never
described.

Two things survive that rule. The janitor guard is kind 4 above: when the wrong
edit is one a future reader is likely to make, name it and its consequence,
because that reader is the one at risk. And a non-obvious rule may state the
failure it prevents, in one present-tense sentence, as the reason the rule
exists. A road not taken while writing is neither of those; cut it.

## Worked judgments

KEEP — above a loop: `// Avoid compiler unrolling, we *really* don't want that
to happen here for binary-size reasons.` The reason lives outside the code, and
no name carries it.

KEEP — above `if tail & self.mark_bit != 0`: `// Check if the channel is
disconnected.` It reads as a bare "what", and no reader reconstructs
*disconnected* from a bit test against `mark_bit`.

KEEP — above `dictPauseRehashing(d)`: `/* This is needed in case the scan
callback tries to do dictFind or alike. */` A janitor guard on a call that
looks removable.

KEEP — above `v = rev(v); v++; v = rev(v);`: `/* Increment the reverse cursor
*/`. Those three lines do not yield the phrase, and *reverse cursor* is the
concept the function's header essay defines; the line is the link between the
two. This is the case where resemblance and reconstruction disagree, and
reconstruction decides.

CUT — above `if let Some(must_abort) = must_abort`:
`// Check if we need to abort immediately.` The identifier already says it, so
the reader spends a line and learns nothing.

## Languages whose function head carries more

C has no doc-comment slot, so the block above a function carries both the
contract and the design essay, and in-body comments run terser than the Rust
baseline. Put the comments at the head of the function, and inside a body write
only a small note about something particularly clever or ugly — a body needing
section commentary is a function length problem first. The effect is placement
rather than length: most of the comment lines in a C file sit at column 0 above
functions.
