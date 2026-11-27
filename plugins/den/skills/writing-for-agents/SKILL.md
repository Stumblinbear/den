---
name: writing-for-agents
description: Principles for instructions an LLM agent will follow, with the calibration for current models.
when_to_use: ALWAYS invoke this skill before writing or editing a file an agent will follow, whether an agent definition, a skill, a CLAUDE.md or rules file, a hook's injected text, or a message a plugin prints to the model, and when an agent keeps ignoring an instruction, before strengthening it. Do not write or edit such a file directly; use this skill first.
user-invocable: false
---

# Writing for agents

Every instruction competes for the model's attention, so each rule you add
makes every other rule a little less likely to be followed. Test each sentence
by asking "would removing this cause mistakes?" Delete a sentence that fails,
whole, rather than trimming it: a sentence that changes nothing still costs
attention. Sentences that pass are usually:

- pitfalls;
- reasons;
- conventions that differ from the usual default;
- decisions the agent couldn't work out on its own.

Sentences that fail are usually things the agent can see in its environment,
common practice, tutorials, and things the model already does right without
being told.

## Core principles

- **Say what to do, not what to avoid.** Naming a behavior in order to forbid
  it makes the model more likely to do it, not less: *don't think of an
  elephant*. An example of what you want works better than a prohibition, and
  one short instruction works better than a list of bad patterns. The
  exception is a default the model keeps falling back to. When a general
  instruction only swaps one default for another, a list of the specific
  patterns seen in its output steers it after the general line has failed.
- **Write it in plain language.** Say what you mean in the words you would
  use to explain it to a colleague, even when that takes more of them. A
  compressed sentence leaves the reader to work out what it means, and an
  agent that works it out wrong follows the wrong rule with full confidence.
  Clarity beats density whenever density leaves room for a second reading,
  which is nearly always. A riddle, then the same rule in plain language:
  - `A value is atomic when no part of it changes on its own.` → `Split a
    value into columns or rows when part of it changes on its own, or when
    you need to constrain, reference or join on part of it.`
  - `A transaction is short.` → `Don't keep a transaction that writes open
    while waiting on something slow, such as a network call or a person.
    Every other writer waits until it ends, and the database can't clean up
    behind it, so it grows. Do the slow work first, then open a short
    transaction to write the result. Holding the transaction is fine when
    nothing else uses the database, as in a migration at startup.`
  - `An identifier inside a document is a reference no foreign key can see.`
    → `Store a reference to another row in a foreign-key column, so the
    database rejects one that points at nothing.`
- **Give the reason, not only the rule.** The model generalizes from the
  reason. A bare NEVER doesn't carry over to similar cases it wasn't written
  for. Give each rule its reason once: a reason attached to every sentence
  turns each one into a chain of clauses the reader has to read twice.
- **Set a list as a list.** Three or more items packed into one sentence read
  as clauses of that sentence, so set them as a list, or give the group one
  name. A list that comes up in several texts gets a name.
- **Be concrete enough to steer, and general enough to cover cases you didn't
  list.** Logic that lists every case breaks on the first case it missed, and
  vague guidance gives the model nothing to act on.
- **Give exact steps when a wrong step is costly.** When order matters and a
  mistake is expensive, write the steps out. When several approaches work,
  give the direction. Offer one default with a way out rather than a menu of
  options: a menu makes the agent redo, on every run, a judgment you could
  have made once while writing.
- **Use one term per concept.** Two words for one thing make the reader think
  they mean different things. Use the same word every time.
- **Write for any project.** A skill or agent definition loads in projects
  its author never saw, so its terms, examples and costs must hold everywhere,
  or they mislead. Anything specific to one project goes in that project's
  own rules or plan.
- **Put each rule where it is needed.** A file every task loads states the
  general principle. The specifics go in a file that only the area needing
  them loads.
- **Use a well-known term instead of a paragraph, when the term has one
  meaning.** A term the model already knows well, such as "a *tight* loop" or
  "the test goes *red*", carries a whole behavior. Describing the same
  quality across three sentences costs more for the same result. Use the term
  only when every reader already knows what it means. A term whose meaning
  depends on knowing what you had in mind, such as "atomic" for a column, is
  a riddle: write the sentences instead.
- **Start minimal, and add only against failures you saw.** Start with the
  least instruction that could work, and add only what fixes a failure you
  actually saw, not one you imagined. If you can, build the test before you
  write the instructions. When you see a failure, first work out why it
  happened: the incident is one case of a failure that will come back in
  other forms. Then treat it as a case of a rule you already have, and change
  that rule until it covers the case. Add a new sentence only when no
  existing rule covers the failure, and write it so it holds in any project.
  A sentence about one project's code, or about the incident itself, fixes
  nothing anywhere else. Adding an example for every incident turns a rule
  back into the list of cases it replaced.
- **Keep references one level deep.** Agents read a file linked from a linked
  file partly or not at all, so anything two links away might as well not
  exist.

## Instructions are requests, not guarantees

Instructions are advice. A rule that must hold every time belongs in
something that enforces it: a hook, a permission, a tool restriction or a
schema. When a written rule keeps being broken, the cause is usually that the
instructions around it are too long and the rule gets lost. Fix it by
shortening them or by moving the rule into enforcement. Stronger wording
doesn't help, because it still competes for the same attention. Emphasis such
as "IMPORTANT" or "YOU MUST" works for the one rule that needs it. Used
widely, it stops meaning anything.

When two rules contradict each other, you can't control which one the model
follows. So each rule has one home. A rule several agents need goes in one
file they all load, such as a preloaded skill or a shared file, and an
agent's own definition holds only what applies to that agent alone. A rule
copied into each agent gets fixed in some copies and not in others the first
time it changes.

## Calibrate to the model generation

Detailed instructions that helped older models can hurt current ones. When
the model changes, retune the instructions for it instead of adding more on
top.

Never ask the model to repeat or explain its internal reasoning in its reply.
Reasoning models may refuse, and Fable 5.2, Opus 5.5 and Sonnet 5.5 decline it
as an attempt to extract their reasoning.

Read the reference for each model that may run the text, and write text that
works on all of them. Text that only one model will ever run can be written
for that model alone.

- `references/fable.md`: Fable 5 and later, and Fable 5.2 (effort, early
  stops, approval rules and their exceptions, cautions that build up,
  ownership wording, delegation, style limits, token budgets, updates and
  reports).
- `references/opus.md`: Opus 5.5 and Opus 5 (effort, narration, early stops
  in unattended runs, verification, severity filters, conciseness).

## Audit pass

For each rule in an existing set of instructions, in this order:

1. Would removing it cause no mistakes? Delete it.
2. Does the model already do this without being told? Delete it.
3. Must it hold every time? Move it into enforcement and delete the rule.
4. Is it a procedure, or a rule for a narrow case, in instructions every task
   loads? Move it to a file that loads only when it is relevant.
5. Is it a prohibition with no reason? Rewrite it as what to do, with the
   reason.
6. Does it repeat or contradict a rule somewhere else? Keep one home for it.
   Search all the instruction files for a distinctive phrase from the rule,
   since reading one file can't show you its copies.
