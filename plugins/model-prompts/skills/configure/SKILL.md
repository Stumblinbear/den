---
name: configure
description: How the model-prompts plugin works and how it is configured, covering per-model rows, text kept in a file, switching a row off, and whether a row repeats on every model switch.
when_to_use: ALWAYS invoke this skill when the user asks how the model-prompts plugin works, why a prompt for a model did or did not appear at session start or after a `/model` switch, or wants to change what is injected. Do not edit the plugin's config.toml or explain its behavior from memory; use this skill first.
---

# Configuring model-prompts

The data directory as it stands:

!`test -f "${CLAUDE_PLUGIN_DATA}/config.toml" && echo "config.toml: present" || echo "config.toml: absent"; test -f "${CLAUDE_PLUGIN_DATA}/.runtime" && echo ".runtime: $(cat "${CLAUDE_PLUGIN_DATA}/.runtime")" || echo ".runtime: absent, so bun when found and node otherwise"`

With no `config.toml`, nothing is injected.

## Running it

The hook needs Node 22.6 or newer, or bun on `PATH`, which it prefers when it
is there. On an older Node with no bun, the user sees one line naming the
version needed and the version found, and nothing is injected. To force one
runtime, write `node` or `bun` into a `.runtime` file in the data directory:

```sh
echo node > "${CLAUDE_PLUGIN_DATA}/.runtime"
```

## What it does

When a session starts, resumes, is cleared, compacts or forks, and when the
user switches model, the plugin adds to Claude's context the text of every
configuration row whose key matches the model the session is now on. Every
matching row is added, in the order the rows are written in the file, so a
general row and a model-specific row both land. Subagents never get any of
it.

A row's `on_switch` decides whether it comes back on a model switch: `every`
adds it on each switch into a matching model, `once` only if it hasn't been
added in this session yet, and `never` not at all.

When the plugin can't tell which model the session is on, which happens
right after a clear, it adds nothing until the next start or switch that names
the model.

For a "why did it" or "why didn't it" question this doesn't answer, read the
Operation and limitations and Troubleshooting sections of
`${CLAUDE_PLUGIN_ROOT}/README.md`.

## Changing the configuration

The hook reads one file:

    ${CLAUDE_PLUGIN_DATA}/config.toml

That directory survives plugin updates. When the file doesn't exist yet,
copy the example, which documents every key:

    cp -n "${CLAUDE_PLUGIN_ROOT}/hooks/config.example.toml" \
      "${CLAUDE_PLUGIN_DATA}/config.toml"

Edit the copy, never the example: a plugin update replaces the example. An
edit takes effect on the next session start or model switch, with no reload.
Read the Configuration section of `${CLAUDE_PLUGIN_ROOT}/README.md` before
writing a row: it lists every key, its type and its default, and how a row
key is matched.

When you write a row:

- Use `on_switch = "every"` for a rule about how a model behaves rather than
  about the task, since the behavior comes back with the model and the task
  doesn't.
- Write the text as an instruction to Claude, with its reason, since Claude
  reads it, not the user.

## When something is wrong

A line starting `model-prompts:` reaches Claude, with an instruction to pass
it to the user, and nothing is injected while it stands:

- `parser error`: the TOML parser is missing from the plugin's cache
  directory.
- `config error`: the line names a file that can't be read, parsed or used.
- `internal error`: a fault in the plugin itself, with nothing in the
  configuration to fix.

The line comes back on every session start and model switch until the fault
is fixed.

## Checking a change

Run the hook by hand to see what it will inject at a session start, or what it
objects to:

    printf '%s' '{"session_id":"check","hook_event_name":"SessionStart","source":"startup","model":"claude-opus-5"}' \
      | node "${CLAUDE_PLUGIN_ROOT}/lib/shared/launch.mjs" --data "${CLAUDE_PLUGIN_DATA}" \
        hooks/model-prompts --config "${CLAUDE_PLUGIN_DATA}/config.toml"

For a model switch, use this input instead:

    {"session_id":"check","hook_event_name":"PostModelSwitch","to_model":"claude-opus-5"}

It prints the text it would add, the error line, or nothing when no row
matches. Both checks share the session `check`, so a `once` row the first
check added is left out of the second, as it would be in a real session.
Delete `claude-model-prompts/check.json` from the OS temp directory between
checks to see each on its own, and afterwards.
