---
name: writing-for-agents
description: General principles for writing instructions for LLM agents, whether system prompts, persistent rule files, or prompt bodies of any kind. Use when authoring, auditing, or editing instructions an agent will follow, to apply documented prompt-authoring canon and current-model calibration.
when_to_use: Instructions an agent will follow include a SKILL.md, an agent definition, a CLAUDE.md or rules file, a system prompt, a hook's injected text, a brief or launch prompt for a subagent, and a message a plugin prints to the model. Also use when an agent keeps ignoring an instruction, before strengthening its wording.
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
  instruction outperforms an enumerated list of bad patterns.
- **Give the reason, not only the rule.** The model generalizes from the why;
  a bare NEVER doesn't transfer to adjacent cases it wasn't written for.
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
- **Prefer a leading word to a restatement.** A single concept the model
  already holds from pretraining ("a *tight* loop", "the test goes *red*")
  anchors a whole behavior in one token; a quality restated across three
  sentences is the expensive way to buy the same anchor. When several
  sentences gesture at one idea, collapse them into the word for it.
- **Start minimal, grow against observed failures.** Begin with the least
  instruction that could work, add only what closes a failure you actually
  saw, not one you imagined. Where possible, build the eval before the
  instructions.
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
get to pick which one wins. One home per rule.

## Calibrate to the model generation

Prescriptiveness that helped older models can hurt current ones. Recalibrate
instructions when the model changes rather than accreting.

- **Strong instruction-followers (Fable 5)**: a brief instruction steers as
  well as enumerating each behavior by name; instructions tuned for prior
  generations are often too prescriptive and degrade output. Never instruct
  the model to echo or explain its internal reasoning as response text. On
  reasoning models this can trigger refusals.
- **Self-verifying models (Opus 5)**: drop "verify your work" / "double-check"
  scaffolding. It causes over-verification with no quality gain. Severity
  filters in review-style prompts ("only report high-severity") are followed
  literally and cause under-reporting; ask for everything and filter in a
  separate pass. Conciseness must be asked for explicitly, and in a long
  prompt the reminder bears repeating near the end.

## Audit pass

For each rule in an existing instruction set, in order:
1. Fails the removal test? (Delete.)
2. Does the model already do this unprompted? (Yes → delete.)
3. Must it hold every time? (Yes → move to enforcement, delete the rule.)
4. Is it a procedure or narrow-context rule living in always-loaded
   instructions? (Yes → move it where it loads only when relevant.)
5. Phrased negatively without a why? (Rewrite positive + rationale.)
6. Duplicates or contradicts another rule anywhere in the hierarchy?
   (Keep one home.)

## Platform-specific guidance

- **Configuration skills for Claude Code plugins:**
  `references/configuration-skills.md` (what a plugin's configure skill
  covers and in what order: prerequisites first, one shape, arriving with
  the state read, where a setting lives, the standing cost of every line).
