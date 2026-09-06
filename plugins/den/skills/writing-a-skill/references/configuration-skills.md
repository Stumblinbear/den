# Configuration skills

What a plugin's configure skill covers, and in what order, drawn from Claude
Code's skill and plugin references and the setup skills that ship in public
marketplaces. The core principles apply first; this is the shape they take
for one kind of skill.

## Prerequisites first

The reader who cannot run the plugin finds out in the first screen: the
runtime floor, the one-line failure it prints, and any install step. A
prerequisite that arrives after the walkthrough is one the reader has
already tripped over. A task-shaped skill restates it before the flow
starts.

## One shape, promised by the description

A task-shaped configure skill is the procedure in this order: read what is
configured now, ask with the current value shown in each option, write,
confirm what changed, and end with the hand-edit fallback for when a step
cannot run, with the tools those steps run pre-approved in `allowed-tools`.
A description that promises "change it" over a body that only explains it
mixes the two kinds, and a write step grafted onto prose is the usual result.
Pick one; a second, task-shaped skill is how the other is added.

## Arrive knowing the state

The preamble reports whether the configuration file exists and what the
settings hold. Paths in a plugin skill are written as `${CLAUDE_PLUGIN_DATA}` and `${CLAUDE_PLUGIN_ROOT}`,
which Claude Code substitutes in plugin skills; a literal directory is right
for one marketplace name only.

## What earns its lines

Three sections the shipped setup skills lack and that answer the questions
users actually bring:

- A causal model: what fires, on which event, reading what, and the
  consequences that answer "why did it" and "why didn't it".
- Exact hand-run commands that show what a change does before the session
  does, so an edit is checked rather than trusted.
- The line at what is deliberately not configuration, naming the file that
  holds it, so the reader does not edit the wrong thing.

## Where a setting lives decides what the skill says

`userConfig` in `plugin.json` declares a flat set of scalars (string, number,
boolean, directory, file; no enumerations, no tables) that Claude Code
prompts for when the plugin is enabled, stores in the user's settings, and
exports to hook processes as `CLAUDE_PLUGIN_OPTION_<KEY>`. It fits a fact
about the installation. Behavior with rows, per-row overrides or messages
lives in a file the plugin parses, with a commented example to copy. The
skill documents the file; a prompt the host already made needs no
walkthrough.

## Every line is a standing cost

The rendered skill enters the conversation once and is never re-read, and
compaction keeps only its first five thousand tokens within a shared budget.
A configure skill is loaded when something is wrong, in a session that is
often already large; what it says has to be worth carrying to the end.
