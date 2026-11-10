---
name: writing-for-humans
description: How text a person will read is written, in the register a person would use, whichever of its kinds it is.
when_to_use: ALWAYS invoke this skill before writing or revising a README, a guide or reference page, an architecture or decision document, a doc comment or docstring, a comment inside a function body, a commit message or pull request description, or a report or message for a person, when reviewing text an agent drafted for a person, and when the user says a draft sounds like AI or is slop. Do not write, revise or polish such text directly; use this skill first.
user-invocable: false
---

# Writing for humans

A person reads once, slowly, top-down, scanning for the part that answers
their question, and does not hold a thousand words at a time. An agent writes
the way it reads: it drafts a thousand words and re-reads them a dozen times
before a person has got through them once. The rules below close that gap for
every kind of text at once; each reference adds what is true of its kind
alone, so read the one for the text in hand.

## Every kind of text

- **Answer first.** The conclusion goes at the top of every unit (the page,
  the section, the paragraph, the summary line), and headings, bullets and
  sentences open on the information-carrying word. A scanning reader reads the
  third word of a line much less often than the first two.
- **Cut to what the reader acts on.** Short sentences, concrete nouns, claims
  a reader can check. A sentence the reader does nothing with still costs them
  the time to read it.
- **Write what is, not what changed.** The reader never saw the change, and
  history has homes that stay accurate: version control, a changelog, a
  deprecation marker, a decision record. Rewrite a change narration into the
  reason it left behind: `Uses a manual loop; iterator chains here unroll at
  -O2 and double the binary` rather than `no longer uses iter()`. A sentence
  about something the text does not contain, a field it lost, a case it does
  not handle, a decision that belongs elsewhere, is the same narration in the
  grammar of a ruling: the reader who never saw the thing has nothing to
  attach it to. Cut it.
- **Cite what the reader can still reach.** In two years they hold this
  repository and its trackers, so RFCs, standards, papers, stable URLs and
  in-repo files still resolve, and so does an upstream issue that is the
  reason for a workaround. Commit SHAs, review-finding labels, dated rulings,
  a document that is not in the repository, and a person's name as the only
  handle do not. An ID into this project's own tracker resolves and leaves
  anyway: it is history, and its home is the commit message or the changelog.
  Where the material is already written down outside this project, cite it
  rather than restate it.
- **One term per concept.** A reader who meets two words for one thing spends
  the reread deciding whether they differ.

## The register

A reader who recognizes the machine register stops reading, and every sentence
after that one is wasted. The rules below belong in the first draft: a cleanup
pass over machine prose adds machine traits of its own.

- **Put a character in the subject and the action in the verb.** `The parser
  rejects a trailing comma`: the actor and the action reach the reader in the
  first three words. Plain verbs, `is`, `has`, `wrote`, `used`, carry a
  sentence that a dressed-up one only decorates.
- **State it in positive form.** Say what holds, and keep `not` for a real
  denial or antithesis, because an evasive `not` spends a clause and leaves the
  reader without the fact.
- **Name the source or drop the claim.** A number, a path, a line. A claim with
  nothing behind it reads as padding, and it usually is padding.
- **One idea per sentence, varied shapes across the paragraph.** Sentences of
  one length and one build are themselves the register, so a short sentence
  earns its place beside a long one. Fragments are fine.
- **Break any rule sooner than write something worse.** A rule followed into an
  awkward sentence costs the reader more than it saved.

Before you read a draft, run one line over it:

```sh
grep -nEi '—| -- |\bwhere\b|\bnames?\b|as \S+ (says|does)|see there|stands (in|under)|no longer|belongs to (its|a) |handled elsewhere' FILE
```

A hit marks a sentence to look at and settles nothing by itself: `where`
opens a real relative clause and `name` is a real noun, so a hit is read
against the list below. An em dash, or ` -- `, is the exception, and every
one is a sentence to rewrite.

When the text already exists, check the sentences the grep and the list name,
rewrite those, and leave the rest alone: a polish pass over prose that is
already fine puts the register back in. Text that is wrong throughout is
rewritten from scratch in one step. A rewrite that removes only the sign
leaves the substance where it was; a sourceless claim is still sourceless once
the word `pivotal` is gone.

## The tells

The patterns below are the ones our own text has drifted into, each with its
fix. A pattern goes in the day it is seen in our text and comes out when it
stops appearing: a catalog of every tell ever named is a dictionary nobody
reads.

- **`where` as a condition.** `Where the key is absent, the call returns
  None.` Fix: `if` or `when`.
- **`name` as a verb.** `the panic names the statement`, `a lookup names what
  it returns`. Fix: write what happens: `the panic message includes the
  statement`, `a lookup's name says what it returns`.
- **The pointer in place of the claim.** `as Load says`, `as insert does`,
  `see there`. Fix: make the claim, or link the item and stop.
- **The tail carrying a second claim.** `..., the save panics otherwise`,
  `..., which the next save writes again`, and the same clause after a
  semicolon. Fix: give the second claim its own sentence.
- **The colon standing in for a verb.** `root becomes it: it is given every
  component...`. Fix: write the verb.
- **The noun doing a verb's work.** `the load's ending`, `the entity the read
  is of`. Fix: say who does what: `the load ends`, `the entity the read loads
  onto`.
- **The relation verb.** `a surface stands in its group`, `the save holds it
  under its parent`. A prose verb for a relation names nothing the reader can
  check against the code. Fix: the relation the code has: `belongs to`, `is
  a child of`.
- **The participial tail.** `..., ensuring consistency across the codebase`.
  Fix: cut it, or promote its fact to a sentence with a subject.
- **The explained absence.** `the limit belongs to the caller, not to this
  file`, `this no longer takes a timeout`, `that case is handled elsewhere`.
  A change narration in the grammar of a ruling. Fix: delete it. Where a
  reader would fill the gap in, a guard at the site of the wrong edit says its
  consequence.
- **The em dash.** Every one, and ` -- ` typed in ASCII. Fix: a comma, a full
  stop or a colon, or the sentence rewritten.

## References

Each entry file is complete for the common case; its siblings are read when
the condition they name fires.

- **A README:** `references/readme/readme.md` (router or manual and the
  budget each carries, what the first screen holds, usage before
  installation, what the software does to the reader's machine, purpose and
  status, headings as the interface, what links out). Sibling:
  `references/readme/render-targets.md` for crates.io, PyPI and npm.
- **Documentation outside the code:** `references/documentation/documentation.md`
  (one job per document, an opening that declares kind and reading mode,
  front-loading the page and the paragraph, the heading and paragraph numbers,
  anchoring the material in the reader's task, currency over completeness,
  when to split). Siblings: `references/documentation/decisions.md` for
  decision records and architecture descriptions,
  `references/documentation/ecosystems.md` for Python and Go.
- **A doc comment or docstring on a code item:**
  `references/doc-comments/doc-comments.md` (what counts as contract, the
  summary as the only text an index renders, the four slots, what a doc
  never holds, one fact per level, the section names, the dialect to avoid,
  when an existing doc is changed). Siblings, one per language whose form differs from Rust:
  `go.md`, `python.md`, `java.md`, `csharp.md`, `swift.md`, `typescript.md`
  in the same directory.
- **A comment inside a function body:** `references/inline-comments.md`
  (the reconstruction test and the higher-level "what" it licenses, the kinds
  that earn a line, placement at the narrowest scope, one master comment with
  pointers, the counterfactual that guards a future edit rather than defending
  this one, the one-line target under the ceiling).
