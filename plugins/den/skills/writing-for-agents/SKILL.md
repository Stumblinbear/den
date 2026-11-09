---
name: writing-for-agents
description: Principles for instructions an LLM agent will follow, with the calibration for current models.
when_to_use: ALWAYS invoke this skill before writing or editing a file an agent will follow, whether an agent definition, a skill, a CLAUDE.md or rules file, a hook's injected text, or a message a plugin prints to the model, and when an agent keeps ignoring an instruction, before strengthening it. Do not write or edit such a file directly; use this skill first.
user-invocable: false
---

# Writing for agents

Instructions compete for a finite attention budget: every rule added makes
every other rule slightly less followed. A rule earns its place by the removal
test, "would removing this cause mistakes?", applied per sentence, and a
sentence that fails is deleted whole rather than trimmed: prose that changes
nothing costs attention to say nothing. Rules
that survive it are typically pitfalls, rationale, conventions that differ
from defaults, and decisions the agent cannot derive; rules that fail it are
typically things derivable from the environment, self-evident practice,
tutorials, and behavior the model already gets right unprompted.

## Core principles

- **Say what to do, not what to avoid.** Naming a behavior to prohibit it makes
  it more available, not less: *don't think of an elephant*. A positive
  example of the wanted behavior outperforms a prohibition, and one short
  instruction outperforms an enumerated list of bad patterns. The exception
  is a default the model keeps returning to: when a general instruction only
  trades one default for the next, a list naming the specific patterns seen
  in its output steers where the general line did not.
- **Give the reason, not only the rule.** The model generalizes from the why;
  a bare NEVER doesn't transfer to adjacent cases it wasn't written for. A
  rule carries its reason once: a reason hung on every sentence turns each
  into a clause chain the reader parses twice.
- **Set a list as a list.** Three or more items folded into a sentence's
  commas read as clauses of it, so they are set as a list or given one name.
  A list that recurs across texts gets the name.
- **Write at the right altitude.** Between two failure poles: brittle
  enumerated logic that shatters on unanticipated cases, and vague guidance
  that gives no concrete signal. Concrete enough to steer, loose enough to
  survive situations you didn't enumerate.
- **Match specificity to fragility.** Exact steps where a wrong step is costly
  and the sequence matters; general direction where several approaches are
  valid. Offer a default with an escape hatch: presenting an option menu
  re-spends, on every run, judgment you could have spent once while writing.
- **One term per concept.** Synonym variety reads as distinction; consistency
  is parsing help.
- **Write for any project.** A skill or agent definition loads in
  projects its author never saw, so its terms, examples and costs hold
  everywhere or it misleads the next one; what is one project's belongs
  in that project's own rules or plan.
- **Write in the register of the file's reach.** What every task loads
  states the principle, and the specifics go to the file the area that
  needs them loads.
- **Prefer a leading word to a restatement.** A single concept the model
  already holds from pretraining ("a *tight* loop", "the test goes *red*")
  anchors a whole behavior in one token; a quality restated across three
  sentences is the expensive way to buy the same anchor. When several
  sentences gesture at one idea, collapse them into the word for it.
- **Start minimal, grow against observed failures.** Begin with the least
  instruction that could work, add only what closes a failure you actually
  saw, not one you imagined. Where possible, build the eval before the
  instructions. A failure seen in the field is first read as a case of a rule
  already written: that rule is changed until it covers the case, and a
  sentence is added only when no rule owns the failure. An example appended
  per incident turns a rule back into the enumerated list it replaced.
- **Keep referenced material one level deep.** Agents read nested references
  partially or not at all, so anything two hops away is effectively unwritten.

## Instructions are requests, not guarantees

Instructions are advisory. A rule that must hold every single time belongs in
enforcement: a hook, a permission, a tool restriction, a schema. When a
written rule keeps being violated, the diagnosis is that the surrounding
instructions are too long and the rule is being lost; the fix is to shorten
them or move the rule into enforcement, because stronger wording still
competes in the same over-full budget. Emphasis markers ("IMPORTANT", "YOU
MUST") are a per-rule lever for the one rule that needs it. Used broadly
they devalue to noise.

Contradictions get resolved arbitrarily: when two rules collide, you don't
get to pick which one wins. One home per rule. A rule several agents need
lives in one place each of them loads, a preloaded skill or a shared file,
and an agent's own definition holds only what is that agent's alone: a rule
pasted into each role is corrected in some copies and not in others the first
time it changes.

## Calibrate to the model generation

Prescriptiveness that helped older models can hurt current ones. Recalibrate
instructions when the model changes rather than accreting.

- **Strong instruction-followers (Fable 5 and later)**: a brief instruction
  steers as well as enumerating each behavior by name; instructions tuned for
  prior generations are often too prescriptive and degrade output. Never
  instruct the model to echo or explain its internal reasoning as response
  text: reasoning models can refuse it, and Fable 5.2, Opus 5.5 and Sonnet
  5.5 decline it as reasoning extraction.
- **Fable 5.2**: it applies each instruction as written, so calibrating for
  it is mostly removal.
  - **Effort, not prose, sets thinking.** At `medium` and above a line asking
    for less thinking changes nothing. `high` is the starting level, `low`
    holds for well-specified work, and a level above `high` is kept only
    where a gain was measured. A level tuned on another model is swept
    again. Effort barely changes how long a reply is; the text sets that.
  - **Early stops.** On long work, more often at `low` and `medium`, a turn
    can end on a list of what remains, an offer to continue, or an ordinary
    obstacle. The text that steers it separates two kinds of obstacle: an
    error, a timeout, an empty result or a failing tool is diagnosed and
    worked through, and a blocker someone chose, a file marked untouchable
    or access withheld, is left alone and reported.
  - **An approval rule names the exact actions it covers.** A broad one is
    applied to routine work too: a rule covering messages to people outside
    the conversation held back about half of ordinary requests to
    colleagues.
  - **An exception is written into the rule it lifts.** A separate line
    granting it got the step taken in about one try in ten, and the same
    exception inside the rule in about nine. Naming the steps that need no
    approval works where a general line to act more freely changes nothing.
  - **Cautions build up** wherever context carries over: memory, notes,
    instruction files, a reviewer's conditions passed to the next agent.
    One whose reason no longer holds is deleted, and an absolute rule
    states its scope and reason.
  - **Ownership wording decides structure.** Text that is silent on who owns
    the code, or presents it as someone else's, gets additions beside the
    existing structure and nearby problems reported. Text that says the
    codebase is the agent's own gets repeated code merged and related fixes
    made, at about one and a half times the output, with changes nobody
    asked for. A scope rule elsewhere does not cancel it, and the closing
    summary leaves out the small changes, so the diff is read.
  - **Delegation follows the text.** A standing line to delegate is acted on
    readily. A description of whatever starts a subagent states what one
    costs first, then when it is worth it and how to brief it.
  - **A hard style limit makes its prose choppy,** so a limit is kept only
    where something enforces it.
  - **A token budget written into the prompt changes what it spends,** so
    one is left out unless a test shows it helps.
  - **Updates and reports.** It writes little between tool calls. Where a
    person watches, the text asks for a line before the first call, brief
    updates, and a recap that stands on its own. A final report is written
    for a reader who saw none of the work: key points first, full
    sentences, no term coined during the run.
- **Always-thinking models (Opus 5.5)**: how much the model thinks
  is set by effort, an agent definition's `effort` field, and not by prose.
  A "think carefully" or "don't overthink" line is deleted, and a lower
  effort cuts thinking more reliably than an instruction asking for less.
  Effort names do not carry across models: Opus 5.5 at `medium` matches
  Opus 5 at `high`.
- **Self-verifying models (Opus 5)**: drop "verify your work" / "double-check"
  scaffolding. It causes over-verification with no quality gain. Severity filters in review-style prompts ("only report
  high-severity") are followed literally and cause under-reporting; ask for
  everything and filter in a separate pass. Conciseness must be asked for
  explicitly, and in a long prompt the reminder bears repeating near the end.
  Opus 5.5 runs text written for Opus 5 well, and its guidance names the
  verification and conciseness rules, with scope rules, as possibly no
  longer needed there: they are the first put to the removal test.
- **Under-narrating models (Opus 5.5)**: anti-narration rules
  ("hold findings for the final response") are deleted, not tuned; the
  model already under-narrates, and where updates are wanted the text says
  when: a line of intent before the first tool call, a recap at the end.
- **Early stops in unattended runs (Opus 5.5)**: with no one to answer, the
  model can end its turn on a report that announces the next step instead of
  taking it, offers to carry on, or lists decisions none of which block the
  work; a subagent's turn ending is its return. Naming those stops as
  unwanted steers it, alongside the stops that are wanted: where nothing can
  move without the caller. The caller reads a return as a report, not as
  proof the task is done.

## Audit pass

For each rule in an existing instruction set, in order:
1. Fails the removal test? (Delete.)
2. Does the model already do this unprompted? (Yes → delete.)
3. Must it hold every time? (Yes → move to enforcement, delete the rule.)
4. Is it a procedure or narrow-context rule living in always-loaded
   instructions? (Yes → move it where it loads only when relevant.)
5. Phrased negatively without a why? (Rewrite positive + rationale.)
6. Duplicates or contradicts another rule anywhere in the hierarchy?
   (Keep one home. Search the hierarchy for a distinctive phrase of the
   rule, since a read of one file cannot show its copies.)

