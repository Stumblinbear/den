# Writing a README

A reader treats a README as a landing page, not a manual. They arrive with one
question, *is this for me?*, and they answer it from the first screen, scanning
rather than reading. Only after they decide do they use the README to look
things up. So write the top of it for that decision, and make everything after
it easy to find by scanning the headings.

## Choose the shape first: a router or a manual

One question decides the shape of the whole document. Does a documentation site
already hold the reference material?

- **Yes: a router.** The README states its promise, shows the project working,
  and sends the reader on to the docs site. Keep it within 500 words.
- **No: a manual.** The README is the documentation, so it holds the
  installation table, which shows how to install on each platform, and the list
  of every option.

Limit the number of words, not the number of sections. A fixed list of sections
limits how many topics a README covers but not how deep each one goes, and that
is how READMEs end up covering everything. A manual has no word limit. What
keeps it usable is that a reader can reach every answer from a heading, because
past the first screen, the headings are all a reader reads.

## The first screen answers "is this for me?"

The top half of the screen gets the largest share of the reader's attention. Use
it for:

- **The name.**
- **The promise:** one sentence saying what the project does for the reader, in
  the reader's words, on its own line and at most 120 characters long. Use the
  same sentence for the package manager's `description` field and the repository
  description. That sentence is the line search results show, and a reader who
  meets two different promises trusts neither.
- **One runnable example, or one screenshot.** When what the project does is
  something you can see, show it. A screenshot of the tool working convinces the
  reader faster than a paragraph describing it.
- **Links to the docs,** when a docs site exists. A short block that opens with
  "You may be looking for:" and gives one link per reason someone came, or a
  single line such as `Website | Guides | API Docs | Chat`, tells the reader
  where to go without making them search for it.

Put everything else lower down, including sponsor blocks, long rows of badges
and a hand-written table of contents. Each line above the example pushes down
the content the reader decides from. Start with the promise, and keep badges to
a line or two. Four badges fit on the title line.

## Show usage before installation

Order the document in the order the reader's questions come up:

1. what it is;
2. why to use it over the alternatives;
3. what it looks like working;
4. where else to go;
5. how to install it;
6. how to configure it;
7. its caveats.

An install command answers a question the reader hasn't asked yet, and the
example is what decides whether they adopt the project. So open with a REPL
session or a usage snippet and put "Installing" after it, or put the dependency
line in a `<details>` block below the example.

Put installation first when getting the software onto the machine is the hard
part, as with a command-line tool that ships prebuilt binaries for many
platforms. Even then, open with what the tool is and a screenshot, and put the
installation table in the body.

**Show what the reader sees, not only what they type.** Include the returned
values or the output, not only the call. Make the walkthrough go: create it, run
it, check the result. The output is the evidence that the promise is true.

## What it does to the reader's machine

README templates don't have this section, so you have to add it yourself.

Say so before the install command when the software does any of these:

- runs on the reader's machine;
- touches files it wasn't given;
- sends anything off the machine;
- costs money.

Say it in plain sentences, with the way to opt out right beside it. The reader
is agreeing to something by installing, and they can't agree to something they
only learn about after the install.

Put it on the first screen, or under a heading that says what the effect is,
such as "What it sends" or "Files it writes". A reader who is scanning won't
guess it from a heading like "Configuration". It usually takes one of two forms:

- **A surprising default,** stated in the second sentence with the way to turn
  it off right beside it: "By default, it respects gitignore rules and
  automatically skips hidden files/directories and binary files. (To disable all
  automatic filtering by default, use `-uuu`.)"
- **A cost to the reader** rather than a mechanism: "By using it, you agree to
  cede control over minutiae of hand-formatting."

## Why to use it, and what state it is in

READMEs nearly always say what a project is and how to use it, and nearly always
leave out why to use it and what state the project is in. So write those two:

- **Why to choose this over the alternatives,** in a sentence or a section. Both
  sides are worth the space: "Why should I use it?" and "Why shouldn't I use
  it?". A README whose whole body is a `## Why?` section around a benchmark
  chart can be complete.
- **Status:** what state the project is in, and how much stability the reader
  can rely on, such as the supported language versions, the release schedule and
  the policy for fixing bugs. Status is a claim about the future. A changelog is
  history, so it goes in `CHANGELOG.md`, with a link from the README.

## Headings are how the reader finds things

Past the first screen, a reader looks mostly at the headings and subheadings,
and reads only bits of the text between them. When the headings are missing or
vague, the reader falls back to scanning down the left edge, and misses
information without knowing they missed it. So make each heading say which
question it answers, in the reader's words. A scanning reader finds "Why
shouldn't I use it?" and passes over "Operation and limitations".

Add a hand-written table of contents only when the site the README is shown on
builds no outline from the headings. `render-targets.md` says which sites build
one, and what breaks when the README is published somewhere other than GitHub.

## What to link to instead of writing out

- **A reference for every configuration key.** It is reference material with no
  natural limit, and it grows faster than any other section of a README until it
  turns a router into a manual. Keep the few keys most readers set, with their
  defaults, and link to the rest.
- **Contributing guidelines, code of conduct, security policy and license
  text.** GitHub recognizes `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md` and `LICENSE` as separate files, and the README gives each one a
  line. The contributing line says where to ask questions and whether pull
  requests are accepted. The license line gives the SPDX identifier, and it
  comes last.
- **Where to get help.** It costs a few lines and is easy to forget. Add a short
  "Getting help" section that says where to ask.
- **Internal structure and architecture.** A reader deciding whether to use the
  project doesn't need it.
- **Troubleshooting.** Give it a section only when the software fails in ways
  the reader can't diagnose on their own machine, such as garbled output,
  terminal colors or file encodings. That is rare. Otherwise, link to the issue
  tracker or the support channel.

Link freely, but write out in the README anything a reader needs to understand
the project, because links break over time.

## Which shape to choose

- **Default to the router shape.** Most projects that seem to need a manual
  already have a docs site, a docs.rs page or `--help` output that holds the
  reference.
- **Use the manual shape only when the README really is the only
  documentation.** Make the length usable with headings, not with more prose.
- **Filling in every section of a template is no substitute for choosing a
  shape.** Template advice such as *too long is better than too short* assumes a
  novice reader and is aimed at projects that document nothing. For a writer
  whose usual mistake is writing too much, that advice pushes the wrong way.
