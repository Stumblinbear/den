# Documentation outside the code

A guide, a reference page, an explanation, a docs site: text a person reads
once, top-down, hunting for the one part that answers their question. Calibrate
to Rust — concise, genuinely useful, no filler.

## Open with the document's kind and reading mode

The first paragraph names the subject, the reader it assumes, whether the
document is read through or consulted, and where the neighbouring documents
are. Say it plainly: *read this in sequence from front to back*, or *each
chapter stands alone* — then what the document does not cover and which one
covers that instead.

A reader who arrived from a search result decides in one paragraph whether they
are in the right place; without that paragraph they read the wrong document to
the end.

It doubles as a separation test: a document whose opening cannot name one kind
is doing two jobs.

## One job per document

Diátaxis names four kinds, and its compass picks one from two questions —
"action or cognition?" and "acquisition or application?":

| The content informs… | …the reader's…       | …so it is a  |
| -------------------- | -------------------- | ------------ |
| action               | acquisition of skill | tutorial     |
| action               | application of skill | how-to guide |
| cognition            | application of skill | reference    |
| cognition            | acquisition of skill | explanation  |

Run the compass on each section as well as on the whole — it applies from a
single sentence up to an entire document — and a section that answers a
different question than the document around it is where a split belongs.

- **Reference is neutral description**, and neutrality is its whole imperative.
  Structure it to mirror the product, so a reader can move through both
  together. The explanation that grows inside a reference page — why the design
  is this way, what else was possible — moves to an explanation document,
  because a reader consulting reference at work pays for every sentence they
  have to skip.
- **Explanation is the one kind with no natural boundary.** It can and must
  consider alternatives, counter-examples and competing approaches, which makes
  knowing where to start and where to stop the difficulty. Fix the topic in the
  opening and end there.
- **A tutorial serves the reader at study; a how-to serves the reader at
  work.** The tutorial owns the reader's success and removes surprises; the
  how-to assumes competence and prepares for real conditions. A page that tries
  both leaves the beginner stranded and the working reader wading.
- **Write documents first and let the structure follow.** Empty
  tutorial/how-to/reference/explanation scaffolding with nothing in it helps
  nobody. Improve in small steps: one document, one change, published.
- **Organize a site by subject, not by kind.** A reader arrives knowing their
  subject, not knowing which kind of information will answer them, so group by
  artifact or product and separate the kinds one level down, inside the
  subject. Python's ecosystem differs — see `ecosystems.md`.

## Front-load the page and the paragraph

A reader scans a new page rather than reading it, and their eyes fall in an
F-shape down the left edge. The consequence is blunt: the first two paragraphs
must state the most important information.

- **Page.** The first paragraph gives the answer, then what, why, and how.
  Background comes after it.
- **Paragraph.** One idea, carried by the first sentence — the most important
  sentence of any paragraph. Three to five sentences, or three to seven lines,
  is welcome; past about seven sentences readers skip the paragraph.

**Cut a sentence by its ideas, not by a word count.** A sentence carrying two
ideas becomes two sentences or a list, and a short sentence carrying two ideas
is still the hard one to read.

## Headings

- **One heading level is usually plenty for a page or two.** Add a second level
  only where a first-level section holds at least two distinct topics.
- **Headings must read as an outline on their own.** A reader who skips the
  headings almost certainly skips the text under them too. Keep them short,
  most important idea first, specific, and parallel in structure within a
  level.
- **Sentence case, no closing period.**
- **Put text between two headings.** Two headings in a row means the
  organization or the headings are redundant, and filler inserted to separate
  them is not the repair.
- **Use a bold run-in heading for a sub-topic too small to earn a heading of
  its own.**

## Anchor the document in the reader's task

The material that earns space is the material the reader does something with.

- **Start on the reader's task in the first screenful.** Preamble that delays
  the first action is the material to cut.
- **Anchor the material to tasks the reader already has,** rather than to the
  tool's own structure. A section that exists because the product has that
  feature, and not because anyone needs it, is the one to drop.
- **Support error recognition and recovery.** Name the likely failure at the
  step where the reader meets it, with the way back. A stuck reader stops
  reading and starts guessing; the recovery note is what returns them.
- **Make units self-contained.** The same document is read to do, to study, and
  to locate, so a reader who lands in the middle or skips ahead still has to
  succeed.

## Currency over completeness

- **Write the documentation change in the same commit as the code change.**
- **Prefer a few fresh documents to many stale ones.** Incorrect documentation
  is worse than missing documentation, and a document nobody will update starts
  costing the moment the code moves.
- **Link a fact rather than restate it in a second document.** One fact, one
  home — two homes drift, and the reader cannot tell which one is current.
  Repetition *within* one document is fine and often necessary, since a reader
  who entered mid-document never saw the earlier statement.
- **Cover a concept in full or not at all.** Half a concept sends the reader
  looking for the other half, which is the search the document was meant to
  end.

## When to split

Split on kind, not on length.

- **Two reader states mean two documents.** A page that a newcomer reads
  through and an expert consults serves neither; that is the tutorial/how-to
  and reference/explanation seam again.
- **Length alone is not a reason.** Attention drops off sharply past the first
  screenful and is nearly spent by the third, so a long document needs
  navigation inside it before it needs cutting in two. GitHub and a generated
  docs site build that navigation from the headings; a hand-written contents
  list and back-to-top links earn their lines only where the render target
  builds no outline of its own.
- **Keep one concept in one document.** A concept spread over two pages is read
  as two half-answers.
- **A split must leave every fact with one home.** If the split forces the same
  fact into both documents, the seam is wrong: put the fact in one and link it
  from the other.

## Further

- **Decision records and architecture descriptions:** `decisions.md` — the ADR,
  arc42 and C4 forms, where a record is dated and superseded rather than
  revised.
- **Ecosystems that differ from the Rust baseline:** `ecosystems.md` — Python's
  kind-first sites, Go's package comment as the document.
