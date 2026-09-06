---
name: writing-for-humans
description: How text a person will read is written, in the register a person would use, whichever of its kinds it is.
when_to_use: ALWAYS invoke this skill before writing or revising a README, a guide or reference page, an architecture or decision document, a doc comment or docstring, a comment inside a function body, or a report or message for a person, when reviewing text an agent drafted for a person, and when the user says a draft sounds like AI or is slop. Do not write, revise or polish such text directly; use this skill first.
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
  -O2 and double the binary` rather than `no longer uses iter()`.
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
after that one is wasted. The register is a small set of habits, and each rule
below replaces one of them with what a person would have written. They belong
in the first draft: a cleanup pass over machine prose adds machine traits of
its own.

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
grep -nEi '—| -- |emphasiz|enhanc|highlight|showcas|in (summary|conclusion)|overall,|important to note|worth noting|in this (section|guide|article)|let'?s dive|as of my last update|not just .+ but|serves as|stands as' FILE
```

The line carries the current vocabulary band and the phrasings that belong to
the register itself. A hit marks a sentence to look at and settles nothing by
itself: `highlight` is a real word, and a finding needs several signs sitting
together in one passage. An em dash, or ` -- `, is the exception, and every one
is a sentence to rewrite. A tell people were already writing before the
register, `utilize`, `Note that`, `acts as`, hits too many real sentences to
grep for and stays in `references/tells.md`, which is read with a hit in hand.

When the text already exists, check the sentences the grep and the catalog
name, rewrite those, and leave the rest alone: a polish pass over prose that is
already fine puts the register back in. Text that is wrong throughout is
rewritten from scratch in one step. A rewrite that removes only the sign
leaves the substance where it was; a sourceless claim is still sourceless once
the word `pivotal` is gone.

## References

Each entry file is complete for the common case; its siblings are read when
the condition they name fires, and they are listed here so none is more than
one hop away.

- **The register's tells:** `references/tells.md` (every tell with the fix
  that cures it, grouped by structure, phrasing, vocabulary and framing, the
  vocabulary banded by date, and a closing list of the signs that do not
  count).
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
  `references/doc-comments/doc-comments.md` (the summary as the only text an
  index renders, the four-slot contract check, layering instead of a length
  cap, the section vocabulary and its order, deprecation markers as the home
  for history). Siblings, one per language whose form differs from Rust:
  `go.md`, `python.md`, `java.md`, `csharp.md`, `swift.md`, `typescript.md`
  in the same directory.
- **A comment inside a function body:** `references/inline-comments.md`
  (the reconstruction test and the higher-level "what" it licenses, the kinds
  that earn a line, placement at the narrowest scope, one master comment with
  pointers, the counterfactual that guards a future edit rather than defending
  this one, the one-line target under the ceiling).
