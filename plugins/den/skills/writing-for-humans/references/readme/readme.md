# Writing a README

A README is read as a landing page, not a manual. The reader arrives with one
question (*is this for me?*) and answers it from the first screen, scanning
rather than reading. Only after they decide does the README become reference.
Write for the decision first, and let everything after it be reachable by
scanning headings.

Length is not free. Words added past the first screen buy a shrinking share of
the reader's attention, and a section list does not price them.

## Pick the shape first: router or manual

One question decides the whole document: **does a documentation site already
hold the reference material?**

- **Yes → router.** The README promises, demonstrates, and hands off. Give it a
  budget of 500 words and hold to it.
- **No → manual.** The README *is* the documentation, so it carries the
  installation matrix and the option catalogue.

Budget words, not sections. A section list restrains breadth and leaves depth
unbounded, which is the mechanism that produces exhaustive READMEs. A manual's
budget is therefore not a word count but heading coverage: long survives only
when every answer is reachable from a heading, which is all a reader past the
first screen reads.

## The first screen answers "is this for me?"

The top half of the viewport takes the largest share of the reader's attention.
Spend it on:

- **The name.**
- **One sentence of promise**, in the reader's vocabulary, on its own line; cap
  it at 120 characters. Make it the same sentence as the package manager's
  `description` field and the repository description: it is the line that
  appears in search results, and a reader who meets two different promises
  trusts neither.
- **One runnable example, or one screenshot.** Where the value is visible
  output, show the output: a screenshot of the tool working outruns a paragraph
  describing it.
- **Links out**, when a doc site exists. A literal router block ("You may be
  looking for:", one link per intent) or a `Website | Guides | API Docs | Chat`
  line answers *where do I go* without making the reader hunt for it.

Everything else moves below: sponsor blocks, long badge rows, a hand-written
table of contents. Each line above the example displaces the content the
decision is made from. Lead with the promise and keep badges to a line or two;
four fit on a title line.

## Usage before installation

Order the document as the reader's questions arrive: what it is, why it over
the alternative, what it looks like working, where else to go, then install,
configure, caveats. An install command answers a question the reader has not
asked yet; the example is what decides adoption. Open with a REPL transcript or
a usage snippet and put "Installing" after it, or fold the dependency line into
a `<details>` below the example.

The opposite order (install first) is right when getting the software onto
the machine is the hard part, a platform CLI with a prebuilt-binary matrix.
Even then, open with what the tool is and a screenshot, and put the
installation matrix in the body.

**Show what the reader sees, not only what they type.** Include the response
values, not only the call; make the walkthrough *create it / run it / check
it*. Output is the evidence that the promise is true.

## What it does to the reader's machine

No README template has this section, so it is the one you add deliberately
rather than copy.

When the software runs on the reader's machine, touches files it was not handed,
sends anything off the machine, or costs money, say so before the install
command, in plain sentences, with the opt-out inline. The reader is consenting
to something, and consent collected after the install is not consent.

Put it in the first screen, or under a heading whose words name the effect
("What it sends", "Files it writes"), because a scanning reader will not infer
it from "Configuration". Two shapes carry it. A surprising default, disclosed in
the second sentence with the escape hatch inline: "By default, it respects
gitignore rules and automatically skips hidden files/directories and binary
files. (To disable all automatic filtering by default, use `-uuu`.)" Or a cost
rather than a mechanism: "By using it, you agree to cede control over minutiae
of hand-formatting."

## Purpose and status

READMEs systematically say *what* and *how*, and systematically omit *why* and
project status. So write the two that are missing:

- **Why this over the alternative**, in a sentence or a section. Both
  directions earn their space ("Why should I use it?" and "Why shouldn't I use
  it?"), and a body that is one `## Why?` around a benchmark chart is a whole
  README.
- **Status**: what state the project is in, and what stability the reader can
  rely on: supported language versions, release schedule, bug-patching policy.
  Status is a claim about the future; a changelog is history, and belongs in
  `CHANGELOG.md`, linked.

## Headings are the interface

A reader past the first screen fixates on headings and subheadings, dipping into
the text between them. Where headings are absent or vague they fall back to
F-shaped scanning and miss information without knowing they missed it. So a
heading names the question it answers, in the reader's words: "Why shouldn't I
use it?" scans; "Operation and limitations" does not.

GitHub generates the page outline from headings, which makes the outline the
table of contents. A hand-written one earns its lines only where the render
target has none: see `render-targets.md`, which also covers what breaks when
the README is republished off GitHub.

## What links out instead of living here

- **A reference of every configuration key.** Unbounded reference material, and
  the fastest-growing section in any README: it is what turns a router into a
  manual. Keep the handful of keys most readers set, with defaults, and link the
  rest.
- **Contributing, code of conduct, security policy, license text.** GitHub
  recognises `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` and
  `LICENSE` as separate files; the README gives each a line. Contributing states
  where to ask questions and whether PRs are accepted; the license line names
  the SPDX identifier and comes last.
- **Where to get help.** Cheap, and easy to forget: a short "Getting help"
  section naming the venue.
- **Internal structure and architecture.** A reader deciding whether to adopt
  does not need it.
- **Troubleshooting** earns a section when the software fails in ways the reader
  cannot diagnose on their own machine: garbled output, terminal colors, file
  encodings. That is rare; otherwise point at issues or support.

Link aggressively, and inline anything essential to understanding the work:
links rot, and only GitHub rewrites a relative path. Every link and image that
must survive on a registry page needs an absolute URL.

## Calibration

- **Strong default:** the router shape. Most projects that feel like a manual
  already have a doc site, a docs.rs page, or a `--help` holding the reference.
- **Situational:** the manual shape, when the README is genuinely the only
  documentation. Earn the length with headings, not with prose.
- **Not a substitute:** filling in every section of a template. Template
  advice (*too long is better than too short*) assumes a novice reader and
  targets projects that document nothing; it inverts against a writer whose
  failure mode is exhaustiveness.
