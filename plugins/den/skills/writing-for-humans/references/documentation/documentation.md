# Documentation outside the code

This reference covers guides, reference pages, explanations and docs sites. A
person reads these once, from the top, and looks for the one part that
answers their question. Rust's documentation is the standard to follow. It
is concise and useful, and it has no filler.

## Say first what the document is and how to read it

The first paragraph says:

- what the subject is;
- who the reader is assumed to be;
- how to read the document, in plain words such as *read this in order from
  front to back* or *each chapter stands alone*;
- what the document doesn't cover, and which document covers that instead;
- where the related documents are.

A reader who arrives from a search result uses that paragraph to decide
whether they are in the right place. Without it, they can read the wrong
document all the way to the end.

The paragraph also tests whether the document should be split. If the
opening can't say which one kind of document this is, the document is doing
two jobs.

## One job per document

Documentation comes in four kinds. Two questions tell you which kind a piece
of content is. Does it inform what the reader does, or what they know? And is
the reader learning, or working?

| The content informs what the reader | while the reader is | so it is a   |
| ----------------------------------- | ------------------- | ------------ |
| does                                | learning            | tutorial     |
| does                                | working             | how-to guide |
| knows                               | working             | reference    |
| knows                               | learning            | explanation  |

Ask the two questions of each section as well as of the whole document. They
work on anything from one sentence to a whole document. A section that gets
different answers from the document around it is the place to split.

- **Reference only describes, and stays neutral.** Neutrality is the one
  thing it must have. Give it the same structure as the product, so a reader
  can move through the two side by side. Explanation tends to grow inside a
  reference page: why the design is this way, what else was possible. Move it
  to an explanation document, because a reader who is looking something up
  while working pays for every sentence they have to skip.
- **Explanation is the only kind with no natural limits.** It has to discuss
  alternatives, counter-examples and competing approaches, so the hard part is
  knowing where to start and where to stop. State the topic in the opening,
  and stop when that topic is covered.
- **A tutorial is for a reader who is learning, and a how-to guide is for a
  reader who is working.** A tutorial takes responsibility for the reader
  succeeding, and removes surprises from their path. A how-to guide assumes
  the reader is competent, and prepares them for real conditions. A page that
  tries to be both leaves the beginner lost, and makes the working reader read
  through material they don't need.
- **Write the documents first, and let the structure grow from them.** Empty
  sections for tutorials, how-to guides, reference and explanation help
  nobody. Improve the docs in small steps: make one change to one document,
  publish it, then move to the next.
- **Organize a docs site by subject, not by kind.** A reader arrives knowing
  their subject, but not which kind of document will answer them. So group
  the top level by product or artifact, and separate the kinds one level
  down, inside each subject. Python projects are the exception, covered in
  `ecosystems.md`.

## Put the important part at the top of the page and of each paragraph

A reader scans a new page instead of reading it, and their eyes move down the
left edge of it in an F shape. So the first two paragraphs must state the
most important information.

- **Page.** The first paragraph gives the answer, then what, why and how.
  Background comes after that.
- **Paragraph.** Give each paragraph one idea, and state it in the first
  sentence, because the first sentence is the most important one in any
  paragraph. Three to five sentences, or three to seven lines, is a good
  length. Readers skip a paragraph of more than about seven sentences.

**Split a sentence by its ideas, not by its word count.** Turn a sentence
with two ideas into two sentences or a list. A short sentence with two ideas
is still hard to read.

## Headings

- **One level of headings is usually enough for a page or two.** Add a second
  level only when a first-level section covers at least two separate topics.
- **Make the headings work as an outline on their own.** A reader who skips a
  heading almost always skips the text under it too. Keep headings short and
  specific, put the most important idea first, and give the headings at one
  level the same grammatical structure.
- **Write headings in sentence case, with no period at the end.**
- **Put text between any two headings.** Two headings in a row mean that one
  of the headings, or a level of the structure, is redundant. Remove it.
  Filler text added to separate the headings doesn't fix it.
- **For a sub-topic too small for its own heading, start its paragraph with a
  bold phrase instead.**

## Build the document around the reader's task

Give space only to material the reader will do something with.

- **Start on the reader's task within the first screen.** Cut any
  introduction that delays the reader's first action.
- **Organize the material around tasks the reader already has,** not around
  the structure of the tool. Drop a section that exists only because the
  product has that feature, when nobody needs it.
- **Help the reader recognize errors and recover from them.** At the step
  where a failure is likely, say what it looks like and how to get back on
  track. A reader who is stuck stops reading and starts guessing, and the
  recovery note brings them back.
- **Make each section work on its own.** People read the same document to do
  a task, to study, and to find one fact. So a reader who lands in the middle
  or skips ahead still has to succeed.

## Keep it current rather than complete

- **Change the documentation in the same commit as the code.**
- **Keep a few up-to-date documents rather than many out-of-date ones.**
  Wrong documentation is worse than none, and a document nobody will update
  starts doing harm as soon as the code changes.
- **Link to a fact instead of restating it in a second document.** Keep each
  fact in one place. Two copies drift apart, and the reader can't tell which
  one is current. Repeating a fact within one document is fine and often
  necessary, because a reader who started in the middle never saw the first
  mention.
- **Cover a concept fully or not at all.** A reader given half a concept goes
  looking for the other half, and the document was meant to save them that
  search.

## When to split a document

Split a document by kind, not by length.

- **Readers in two situations need two documents.** A newcomer reads a page
  from start to finish, and an expert looks things up in it. A page written
  for both serves neither. It is the same split as between a tutorial and a
  how-to guide, or between explanation and reference.
- **Length alone is no reason to split.** Attention drops sharply after the
  first screen and is nearly gone by the third. So a long document first needs
  ways to move around inside it, before it needs splitting in two. GitHub and
  generated docs sites build that navigation from the headings. Add a
  hand-written table of contents and back-to-top links only when the place
  that renders the document builds no outline of its own.
- **Keep one concept in one document.** A reader takes a concept spread over
  two pages as two half-answers.
- **After a split, each fact must still be in only one place.** If the split
  forces the same fact into both documents, the split is in the wrong place.
  Put the fact in one document and link to it from the other.
