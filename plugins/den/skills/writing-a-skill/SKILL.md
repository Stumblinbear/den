---
name: writing-a-skill
description: How a Claude Code skill is written, from the listing line the model routes on to the body it loads and the test that shows the trigger fires.
when_to_use: ALWAYS invoke this skill when creating or editing a SKILL.md, its frontmatter, or a reference under it, and when a skill is not invoked where it should be. Do not write or change a skill directly; use this skill first.
---

# Writing a skill

The body of a skill is instructions an agent will follow, and
`den:writing-for-agents` governs it. This skill is what a SKILL.md adds: a
listing line the model routes on, frontmatter that sets how the skill loads,
and a trigger that can be measured.

## The listing line

The model sees one line per skill, `<plugin>:<name>: <description> -
<when_to_use>`, and nothing else until it invokes. The listing has a budget
of one percent of the context window; past it, Claude Code drops
descriptions starting with the skills invoked least, so the skill nobody has
invoked yet loses its text first. Each entry is capped at 1,536 characters.

## description

One sentence in the third person saying what the skill is, nothing about
when. "Use when" here is a suggestion the model weighs against doing the
work itself, and in a 650-trial measurement it lost that weighing a quarter
of the time bare and two thirds of the time when a hook injected competing
instructions. Where the key terms are the trigger topics, as in a craft
skill, they are written once, in `when_to_use`.

## when_to_use

For a skill the model invokes on its own:

```
ALWAYS invoke this skill when <trigger topics>. Do not <what the model would
do instead> directly; use this skill first.
```

The directive alone is bypassed for tasks the model judges simple, the
blocked path alone leaves it without a next step, and together they measured
94 to 100 percent against 77 to 87 for "Use when". This is the one place
"say what to do" yields to a measurement. Trigger topics go inside the
sentence; a keyword list beside it measured no effect. Two skills that claim
one trigger dilute each other, so one owns it and points at the other from
its body.

## The rest of the frontmatter

- `name` is lowercase with hyphens, a gerund where one reads naturally.
- `disable-model-invocation: true` leaves a skill to the user, for a workflow
  with side effects or timing the user owns; it keeps a plain description
  and no directive. `user-invocable: false` leaves it to the model, for
  knowledge that is no action a user would take, and hides it from the `/`
  menu.
- A launcher sets `context: fork` with an `agent`, and `background: false`
  when the invoking turn should wait for the result; its description says
  what it launches and what its argument is.
- `argument-hint` shows the argument's shape in the menu; the body reads it
  as `$ARGUMENTS`, or by name through `arguments`.
- `model` and `effort` override the session's for the turn the skill is
  active, and `hooks` registers hooks for the rest of the session when the
  skill is invoked.
- `paths` loads a skill whenever matching files are worked on, which routes
  by enforcement rather than by description.
- An unquoted value cannot hold a colon followed by a space, and the
  description field is capped at 1,024 characters.

## Body

Reference content is prose the agent reasons with; a procedure is numbered
steps, with the tools its steps run pre-approved for the invoking turn in
`allowed-tools`. One skill is one kind, and the description promises which.
Under 500 lines, every reference named in SKILL.md with what it holds. A `!`
preamble runs before the body reaches the model, so a skill that should
arrive knowing the state reads it there rather than telling the agent to
look. A plugin skill writes its paths as `${CLAUDE_PLUGIN_ROOT}` and
`${CLAUDE_PLUGIN_DATA}`, which Claude Code substitutes. A script bundled
under the skill is run, not read, unless the body says it is there as
reference; running it costs only its output. The body sets the register of
what the agent writes next, so it is written in the register it prescribes.

## Test the trigger

```
claude -p "<prompt>" --plugin-dir <plugin> --max-turns 5 --allowedTools Skill --output-format json
```

then look for a Skill call in that session's transcript; reading the
SKILL.md or doing the work is a miss. `--plugin-dir` loads the checkout, since
the installed copy is a version-keyed cache that a same-version edit never
refreshes. Three prompts per skill, before and after a rewrite.

## References

- Configuration skills for Claude Code plugins:
  `references/configuration-skills.md` (what a plugin's configure skill
  covers and in what order: prerequisites first, one shape, arriving with
  the state read, where a setting lives, the standing cost of every line).
