# Configuration skills

## Prerequisites first

A reader who can't run the plugin should find out on the first screen: the
minimum runtime version, the one-line error the plugin prints when it is
missing, and any install step. A prerequisite that comes after the walkthrough
has already tripped the reader up. A task-shaped skill repeats it before its
steps begin.

## One shape, and the description says which

A configure skill either explains the configuration or changes it. Pick one: to
offer the other, add a second skill.

A configure skill that changes the configuration is a procedure, in this order:

1. Read what is configured now.
2. Ask, showing the current value in each option.
3. Write the change.
4. Confirm what changed.
5. End with how to edit the file by hand, for when a step can't run.

Pre-approve the tools those steps run in `allowed-tools`.

A description that promises to change the configuration, over a body that only
explains it, mixes the two kinds. The usual result is a write step bolted onto
prose.

## Arrive knowing the state

The preamble reports whether the configuration file exists and what the settings
are.

## What is worth its lines

- **What each feature does,** described by its effect: what the user or Claude
  sees, and when. Leave out how the plugin does it, such as what it reads or
  which event it runs on. The agent needs the effect to answer a question or
  choose a setting, and a description of the mechanism goes out of date with
  each change to the code. Point to the plugin's README for the details a "why
  did it" question needs.
- **Exact commands to run by hand** that show what a change does before the
  session runs with it, so an edit is checked rather than trusted.
- **What is deliberately not configuration,** and which file holds it, so the
  reader doesn't edit the wrong thing.
- **The traps in an edit,** such as a message whose wording a feature depends
  on.

## Where a setting lives decides what the skill says

`userConfig` in `plugin.json` declares a flat set of simple values: a string, a
number, a boolean, a directory or a file, with no lists of choices and no
tables. Claude Code asks for them when the plugin is enabled, stores them in the
user's settings, and passes them to hook processes as
`CLAUDE_PLUGIN_OPTION_<KEY>`. Use it for a fact about the installation.

Settings with rows, per-row overrides or messages go in a file the plugin
parses, with a commented example to copy. The skill says where that file is and
how to start one. The README lists its keys, so the skill points there instead
of repeating them. A setting Claude Code already asked for needs no walkthrough.

## Every line costs for the rest of the session

The skill's text enters the conversation once and is never read again, and
compaction keeps only its first five thousand tokens, within a budget shared
with other skills. A configure skill is loaded when something is wrong, often in
a session that is already large, so everything it says has to be worth carrying
to the end.
