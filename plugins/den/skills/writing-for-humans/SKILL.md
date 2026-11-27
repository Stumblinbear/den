---
name: writing-for-humans
description: How text a person will read is written, in the register a person would use, whichever of its kinds it is.
when_to_use: ALWAYS invoke this skill before writing or revising a README, a guide or reference page, an architecture or decision document, a doc comment or docstring, a comment inside a function body, a commit message, pull request description or changelog entry, or a report or message for a person, when reviewing text an agent drafted for a person, and when the user says a draft sounds like AI or is slop. Do not write, revise or polish such text directly; use this skill first.
user-invocable: false
---

# Writing for humans

Write for the way a person reads. A person reads a text once, from the top,
and scans for the part that answers their question. They can't keep a
thousand words in mind at once. An agent drafts for a reader like itself. It
can write a thousand words and reread them a dozen times before a person has
read them once, so its drafts come out longer and denser than a person can
take in.

The rules below apply to every kind of text. Some kinds also have a reference
of their own, listed at the end.

## Every kind of text

- **Put the answer first.** Put the conclusion at the top of every page,
  section and paragraph, and in the summary line. Start each heading, bullet
  and sentence with the word that carries its information. A reader who is
  scanning reads the first two words of a line much more often than the
  third.
- **Keep only what the reader will act on.** Use short sentences, concrete
  nouns and claims the reader can check. Cut each sentence the reader will do
  nothing with, because it still costs them the time to read it.
- **Write it in plain language.** Say what you mean in the words you would
  use to explain it out loud, even when that takes more of them. Cutting
  removes what the reader doesn't need. It never squeezes what they do need
  into fewer words. A dense sentence saves the writer a line and leaves the
  reader guessing what it means, and a reader who guesses wrong acts on the
  wrong thing. A riddle is a sentence that makes sense only to someone who
  already knows what the writer meant. Each example below is a riddle, then
  the same point in plain language:
  - `Order is data.` → `Order is data with meaning. If someone chooses the
    order of a list, store it in a position column and sort by that column.
    The database doesn't keep rows in any order you can rely on: without an
    ORDER BY, it can return them in any order. Even if it did keep insertion
    order, reordering would mean deleting and re-inserting every row after
    the one that moved.`
  - `A NULL means one thing.` → `If an empty value could mean either "none" or
    "not recorded", add a column for the second meaning.`
  - `A retry backs off.` → `After each failed attempt, wait twice as long as
    last time before trying again.`
- **Describe what is, not what changed.** The reader never saw the earlier
  version, so a sentence about the change gives them nothing to use. History
  belongs in places that keep it accurate: version control, a changelog, a
  deprecation marker, a decision record. When a draft tells the story of a
  change, replace it with the reason the code or text is the way it is now.
  Write `Uses a manual loop; iterator chains here unroll at -O2 and double
  the binary` instead of `no longer uses iter()`.
- **Cut sentences about what the text doesn't contain.** Examples are a field
  that was removed, a case the code doesn't handle, or a decision made
  somewhere else. Such a sentence reads like a rule, but it is the story of a
  change too. The reader never saw the missing thing, so they have nothing to
  connect the sentence to.
- **Cite only what the reader can still find.** Picture a reader two years
  from now who has this repository and its issue trackers. These sources
  still work for that reader:
  - RFCs, standards and papers;
  - stable URLs;
  - files in the repository;
  - an upstream issue that is the reason for a workaround.

  These don't:
  - commit SHAs;
  - the labels a review gave its findings;
  - a ruling cited by its date;
  - a document that isn't in the repository;
  - a person's name, when nothing else identifies the source.

  When the material is already written down outside this project, cite it
  instead of restating it.
- **Use one term for one concept, every time.** A reader who meets two words
  for one thing rereads to work out whether the two words mean different
  things.

## The register

Register is how a text sounds. Readers recognize the machine register by its
tells, the habits that give machine writing away. A reader who recognizes it
stops reading, so every sentence after that point is wasted. Follow the rules
below while writing the first draft, because a cleanup pass over text in the
machine register adds new tells of its own.

- **Make the actor the subject and the action the verb.** In `The parser
  rejects a trailing comma`, the reader gets the actor and the action in the
  first three words. Prefer plain verbs such as `is`, `has`, `wrote` and
  `used`. A plain verb carries the sentence, and a fancier verb in its place
  only decorates it.
- **Put statements in positive form.** Say what holds. Use `not` only to deny
  something or to set two things against each other. A `not` that says what
  something isn't, to avoid saying what it is, takes up a clause and still
  leaves the reader without the fact.
- **Back each claim with its source, or drop the claim.** The source is a
  number, a file path or a line. A claim with nothing behind it reads as
  padding, and it usually is padding.
- **Give each sentence one idea, and vary length and structure across a
  paragraph.** Sentences that all have the same length and the same structure
  are themselves a tell. So put short sentences next to long ones. Sentence
  fragments are fine.
- **Break any of these rules rather than write something worse.** A rule
  followed into an awkward sentence costs the reader more than the rule
  saves.

Before you review a draft, run this search over it:

```sh
grep -nEi '—| -- |\bwhere\b|\bnames?\b|as \S+ (says|does)|see there|stands (in|under)|no longer|belongs to (its|a) |handled elsewhere' FILE
```

A match marks a sentence to look at, and doesn't by itself mean the sentence
is wrong. `where` can open an ordinary relative clause and `name` is often
just a noun, so check each match against the tells below. An em dash or a
` -- ` is the exception. Rewrite every sentence that has one.

When you revise text that already exists, rewrite only the sentences the
search or the tells point to, and leave the rest alone. Polishing prose that
is already fine puts the machine register back in. When text is wrong
throughout, rewrite all of it from scratch in a single pass. Fix the problem a
tell points to, and not only the word that gave it away. A claim with no
source still has no source after you delete the word `pivotal`.

## The tells

Each tell below comes with its fix.

- **`where` used for a condition.** `Where the key is absent, the call
  returns None.` Fix: use `if` or `when`.
- **`name` used as a verb.** `the panic names the statement`, `a lookup names
  what it returns`. Fix: say what actually happens: `the panic message
  includes the statement`, `a lookup's name says what it returns`.
- **A pointer instead of the claim.** `as parse says`, `as insert does`, `see
  there`. Fix: state the claim, or link to the item and say nothing more.
- **A second claim on the end of a sentence.** `..., the call panics
  otherwise`, `..., which the next sync writes again`, or the same clause
  after a semicolon. Fix: give the second claim its own sentence.
- **A colon in place of a verb.** `the config file wins: it is read
  last`. Fix: write the verb that says what happens.
- **A noun doing a verb's job.** `the upload's ending`, `the file the read is
  of`. Fix: say who does what: `the upload ends`, `the file the read loads
  from`.
- **A figurative verb for a relation.** `a widget stands in its panel`, `the
  index holds it under its key`. A verb like this gives the reader nothing
  to check against the code. Fix: use the word for the relation the code
  actually has, such as `belongs to` or `is a child of`.
- **An `-ing` phrase on the end of a sentence.** `..., ensuring consistency
  across the codebase`. Fix: cut it, or turn its fact into a sentence of its
  own with a subject.
- **Explaining what isn't there.** `the limit belongs to the caller, not to
  this file`, `this no longer takes a timeout`, `that case is handled
  elsewhere`. Each is the story of a change, phrased as a rule. Fix: delete
  it. If a later editor would likely add the missing thing back by mistake,
  put a note at the spot they would add it. The note says what adding it
  would break.
- **The em dash.** Every em dash, and every ` -- ` typed in its place. Fix:
  use a comma, a full stop or a colon, or rewrite the sentence.

## References

Before you write or edit one of these kinds of text, read its reference:

- **A README:** `references/readme/readme.md`. When the README is also
  published on crates.io, PyPI or npm, read `references/readme/render-targets.md`
  too.
- **Documentation outside the code:**
  `references/documentation/documentation.md`. For a decision record or an
  architecture description, read `references/documentation/decisions.md` too,
  and for Python or Go documentation, `references/documentation/ecosystems.md`.
- **A doc comment or docstring:** `references/doc-comments/doc-comments.md`.
  For a language other than Rust, read that language's file in the same
  directory too: `go.md`, `python.md`, `java.md`, `csharp.md`, `swift.md` or
  `typescript.md`.
- **A comment inside a function body:** `references/inline-comments.md`.
- **A changelog entry:** `references/changelog.md`.
