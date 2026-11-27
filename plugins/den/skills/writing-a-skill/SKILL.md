---
name: writing-a-skill
description: How a Claude Code skill is written, from the listing line the model routes on to the body it loads and the test that shows the trigger fires.
when_to_use: ALWAYS invoke this skill when creating or editing a SKILL.md, its frontmatter, or a reference under it, and when a skill is not invoked where it should be. Do not write or change a skill directly; use this skill first.
user-invocable: false
---

# Writing a skill

A skill's body is instructions an agent will follow, so write it with
`writing-for-agents`.

## The listing line

Until the model invokes a skill, all it sees is one line,
`<plugin>:<name>: <description> - <when_to_use>`. Each line is capped at 1,536
characters. All the lines together get one percent of the context window. Past
that, Claude Code drops descriptions, starting with the skills invoked least, so
a new skill nobody has invoked yet loses its text first.

## description

Write one sentence, in the third person, saying what the skill is, and nothing
about when to use it. A "Use when" line is only a suggestion, which the model
weighs against doing the work itself. In a 650-trial measurement it lost a
quarter of the time on its own, and two thirds of the time when a hook added
competing instructions. When the skill's key terms are also its trigger topics,
as in a skill about a craft, write them once, in `when_to_use`.

## when_to_use

For a skill the model invokes on its own, use this sentence:

```
ALWAYS invoke this skill when <trigger topics>. Do not <what the model would
do instead> directly; use this skill first.
```

Both halves matter. The model skips the directive alone on tasks it judges
simple, and the second half alone tells it what not to do without saying what to
do instead. Together they measured 94 to 100 percent, against 77 to 87 for "Use
when". This is the one place a measurement overrides the rule to say what to do
rather than what to avoid. Put the trigger topics inside the sentence: a list of
keywords next to it made no measurable difference. Two skills that claim the
same trigger weaken each other, so one skill owns it, and its body points to the
other.

## The rest of the frontmatter

- **`name`** is lowercase with hyphens, and a gerund when one reads naturally.
- **`disable-model-invocation: true`** leaves a skill to the user, for a
  workflow with side effects, or with timing the user decides. Such a skill has
  a plain description and no directive.
- **`user-invocable: false`** leaves a skill to the model and hides it from the
  `/` menu. Use it for knowledge, when invoking it is not something a user would
  do.
- **A launcher** sets `context: fork` with an `agent`, and `background: false`
  when the invoking turn should wait for the result. Its description says what
  it launches and what its argument is. The subagent it starts has only the
  skill's text to go on.
- **`argument-hint`** shows the shape of the argument in the `/` menu. The body
  reads the argument as `$ARGUMENTS`, or by name through `arguments`.
- **`model` and `effort`** apply only to the subagent of a `context: fork`
  skill. On a skill that runs in the session they do nothing: the session's
  model handles the whole turn.
- **`hooks`** registers hooks for the rest of the session once the skill is
  invoked.
- **`paths`** loads a skill whenever files matching it are worked on, so the
  skill loads without the model having to choose it from its description.
- **YAML:** an unquoted value can't contain a colon followed by a space. The
  description is capped at 1,024 characters.

## Body

A skill is one of two kinds, and its description says which:

- **Reference:** prose the agent reasons with.
- **Procedure:** numbered steps, with the tools those steps run pre-approved for
  the invoking turn in `allowed-tools`.

Make a skill as long as it needs to be and no longer. Shorter is better, but
never at the cost of clarity.

A skill holds only what the agent needs for its task. The agent reads every line
as an instruction for the task in front of it, so notes on keeping the skill up
to date, such as when to add or remove an entry, go in the commit message or the
project's own docs.

Name every reference in `SKILL.md`, with when to read it. What the reference
holds is for the reference to say.

A `!` preamble runs before the body reaches the model. A skill that should know
the current state when it arrives reads it in the preamble, instead of telling
the agent to go and look.

A plugin skill writes its paths as `${CLAUDE_PLUGIN_ROOT}` and
`${CLAUDE_PLUGIN_DATA}`, which Claude Code fills in.

A script bundled with the skill is there to be run, not read, unless the body
says it is there as a reference. Running it costs only its output.

The agent writes in the style of what it has just read, so write the body in the
style it asks for.

## Test the trigger

```
claude -p "<prompt>" --plugin-dir <plugin> --max-turns 5 --allowedTools Skill --output-format json
```

Then look for a Skill call in that session's transcript. Reading the `SKILL.md`
or doing the work directly is a miss. Use `--plugin-dir` because it loads the
checkout: the installed copy is cached by version, so an edit that keeps the
version number never reaches it. Test three prompts per skill, before and after
a rewrite.

## References

- Before writing or editing a plugin's configure skill, read
  `references/configuration-skills.md`.
