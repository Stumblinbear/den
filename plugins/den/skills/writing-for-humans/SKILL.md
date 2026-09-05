---
name: writing-for-humans
description: How to write text a person will read - a README, documentation outside the code, a doc comment on an item, or a comment inside a body. Use when writing or revising one of those four, where the reader is a person rather than an agent.
when_to_use: Use before writing or reviewing a README, a guide or reference page, an architecture or decision document, a doc comment or docstring, or a comment inside a function body. Trigger phrases - "write the README", "document this", "add a doc comment", "explain this in a comment", "is this comment needed".
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
- **No AI voice.** `den:voice` carries the rules that keep a draft from
  reading as machine-written, and a catalog of the tells with the fix for
  each.

## References

Each entry file is complete for the common case; its siblings are read when
the condition they name fires, and they are listed here so none is more than
one hop away.

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
