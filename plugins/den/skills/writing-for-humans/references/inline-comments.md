# Comments inside a function body

A comment inside a function body is read by someone editing that body, with the
code in front of them. A comment is worth keeping when it tells that reader
something the code next to it doesn't, at a higher level than the code. So a
comment that says *what* a block does, at a higher level than its lines, is as
worth keeping as one that says *why*.

## When a comment is worth keeping

- **The reconstruction test.** Ask whether someone who has never seen this code
  could write your comment from the lines next to it. If they could, delete the
  comment, because the reader already has what it says. Judge by whether the
  code next to the comment gives the reader its content, not by whether the
  comment's words look like the operation.
- **Write at a higher level than the code.** A comment usually describes the
  block's overall intent rather than its steps. With the intent stated, the
  reader can check whether the code does what it set out to do. A comment that
  restates the code line by line never lets them check that.
- **Assume the reader knows the language and the repository.** A comment that
  tells them what either one already told them is wasted. Describe what the code
  does only when the behavior wouldn't be obvious to someone who knows the
  language well.
- **Rewrite an existing comment only to change what it says.** Leave a comment
  as it is when the rewrite would say the same thing in other words. The reader
  learns nothing from such a change, and the diff gets bigger.

## The kinds of comment worth keeping

1. **Summaries of blocks and loops.** In a function long enough to have phases,
   put a line above each phase saying what it does. Above a loop whose job isn't
   obvious, put a line saying what one pass through the loop does. Write these
   in any long function, not only in complicated code. This is the most common
   kind of comment worth keeping.
2. **Invariants and ownership.** Say which field is the source of truth and
   which is derived from it, which locking rules several operations must keep
   to, or what must already be true in the surrounding code. Put the comment
   beside the code that enforces the rule. This kind causes real harm when it is
   wrong, because real bugs hide behind out-of-date comments about locks and the
   order of calls.
3. **Order and cause.** Why one thing must happen before another, such as a
   barrier, a batching or correlation constraint, or a state change that must
   happen in a fixed order. For this reason, every memory barrier gets a
   comment.
4. **A cleanup guard.** A line saying why the code is done this way, at a spot
   where both of these are true:
   - a competent reader might well "clean up" the code there, wrongly;
   - their own first run of the changed code wouldn't show them what broke,
     because the failure is silent, happens only sometimes, or needs a condition
     they won't test.

   This is the only kind of comment that may describe an edit nobody has made
   yet, and only when both are true. An edit no competent reader would make
   needs no warning. A mistake the first run shows needs no guard, because the
   run catches it.
5. **A reason that comes from outside the code,** such as binary size, a
   hardware quirk, a clause in a spec, a benchmark result, or the upstream bug
   report that forced the code into this form. No identifier or refactor can
   express such a reason, so without the comment it is lost.
6. **Indirection the code needs.** An adapter, queue, index or normalization
   pass whose role in the structure, such as what it connects or what it
   indexes, isn't clear from its signature. A reader can follow every line of it
   and still not see why anything needs it.

## Rename, extract, or comment

- **Put a fact that a name can hold into a name.** When the fact is what a value
  is, or what a condition tests, rename the variable, field or function. A
  reader going down the function sees the name at every place it is used, and
  sees a comment only once. A comment explaining a double-negative `result`
  becomes unnecessary when the variable is renamed `matchfound`.
- **Put a relation or an outside reason in a comment.** Examples are the order
  between two places in the code, an invariant that spans several operations,
  ownership, or a reason from outside the code. No identifier can hold these, so
  the only choice is a comment or nothing.
- **Extracting a function to get a name has a cost.** Moving an expression used
  once into a new function just to give it a name makes the reader jump to that
  function every time they read down the code, and it fills the code with
  shallow functions. Extract a function when the code is a concept used more
  than once, or one that deserves a name of its own, such as
  `IsAlreadyProcessed`. Otherwise, give the expression a well-named local
  variable, or leave it as it is with one comment line above it.

## Where to put a comment

- **Put each comment in the smallest scope that contains all the code it is
  about.** A correct comment moved up to the top of the function makes the
  reader remember it until they reach the code it describes. Up there, it is
  also the least likely to be updated when that code changes.
- **Put a comment on its own line, above the block it describes.** A comment at
  the end of a line can only be about that one line. That keeps it at the level
  of the code, and comments that only repeat the code usually look like a column
  of these end-of-line comments.
- **Use the top of a function for a map of its phases,** such as
  `We proceed in three phases:` followed by one line per phase. Put the detail
  for each phase in a comment at that phase.
- **The farther a comment is from the code it describes, the more general it
  must be.** A general comment is also cheaper to maintain, because small edits
  to the code don't make it wrong.

## Explain a decision once, and point to it elsewhere

Explain a decision once, in the one place a developer is sure to look. That is
usually the declaration of the variable, type or enum the decision is about. At
every other place the decision affects, write a one-line pointer to that
explanation, such as
`See the comment on Status for why this list must stay sorted.`

The reason is what happens when something goes wrong, not tidiness. A broken
pointer is obvious, because the reader goes to the place it points to and finds
nothing, and version control tells them what happened. A copy of the explanation
that has gone stale gives no sign of it, and the reader believes it.

A place that a future editor could break still gets its own comment line. Make
that line a pointer, not a second copy of the reasoning.

Rust's `// SAFETY:` comments are the exception. Each one states an obligation
for its own block, and clippy's `undocumented_unsafe_blocks` lint expects one on
every `unsafe` block. So nearly identical `SAFETY` comments on neighbouring
blocks are correct. Write one for each `unsafe` block, and make it state that
block's own obligation.

## Length: aim for one line

Aim for one line. Four lines is already long, and eight lines is the most a
comment should have. Eight is a limit, not a target. When a comment needs more,
cut it down to the rule it reaches, or move it up to the item's doc comment or
the module's. A long comment that is worth its length goes above the function,
not inside it. So a long comment is a block at column 0 before the function, and
the body has one-line comments.

## Describe the code that exists

Describe the code that exists, not code that doesn't, in a doc comment as well
as inside a body. "A naive version would deadlock here" defends the code against
a version that isn't there, instead of saying what the code is. Nothing in the
body keeps such a sentence true, so it goes stale.

Two kinds of comment are exceptions to that rule:

- **A cleanup guard,** kind 4 above, under the conditions given there. It
  describes a likely wrong edit whose damage the editor's first run wouldn't
  show, together with what that edit would break, because that editor is the
  reader at risk.
- **The reason for a rule that isn't obvious.** Such a rule may state the
  failure it prevents, in one sentence in the present tense, as the reason the
  rule exists.

An approach you considered and dropped while writing the code is neither of
these. Cut it.

## Examples

**Keep,** above a loop:
`// Avoid compiler unrolling, we *really* don't want that to happen here for binary-size reasons.`
The reason comes from outside the code, and no identifier could hold it.

**Keep,** above `if tail & self.mark_bit != 0`:
`// Check if the channel is disconnected.` It only says what the code does, but
no reader could work out *disconnected* from a bit test against `mark_bit`.

**Keep,** above `dictPauseRehashing(d)`:
`/* This is needed in case the scan callback tries to do dictFind or alike. */`
It is a cleanup guard on a call that looks safe to remove.

**Keep,** above `v = rev(v); v++; v = rev(v);`:
`/* Increment the reverse cursor */`. A reader couldn't write that phrase from
those three lines. *Reverse cursor* is the idea that the long comment at the top
of the function explains, and this line connects the three lines to it. The
comment's words look like the code, since `v++` increments, but the
reconstruction test says to keep it, and the reconstruction test decides.

**Cut,** above `if let Some(must_abort) = must_abort`:
`// Check if we need to abort immediately.` The variable's name already says it,
so the reader reads a line and learns nothing.

## Languages that put more in the comment above a function

C has no separate doc-comment syntax. So the comment block above a function
holds both its contract and the longer explanation of its design, and comments
inside the body are shorter than in Rust. Put the long comments above the
function. Inside the body, write only a short note about something especially
clever or ugly. A body that needs comments to mark its sections is first of all
a function that is too long. A C file doesn't have fewer comment lines than a
Rust file. It has them in a different place: most comment lines in a C file are
at column 0, above functions.
