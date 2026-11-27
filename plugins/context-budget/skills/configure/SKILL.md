---
name: configure
description: How the context-budget plugin works and how its configuration file is edited.
when_to_use: ALWAYS invoke this skill when the user asks how the context-budget plugin works, why a context notice did or did not appear, why resuming a subagent was denied, why the watcher advised what it did, why a cache wake message arrived or did not, or wants to change when any of them fires, a threshold, a per-model row, the watcher's model, the guard's limits or the wording of any message. Do not edit the plugin's config.toml or explain its behavior from memory; use this skill first.
---

# Configuring context-budget

The data directory as it stands:

!`for f in config.toml; do test -f "${CLAUDE_PLUGIN_DATA}/$f" && echo "$f: present" || echo "$f: absent"; done; test -f "${CLAUDE_PLUGIN_DATA}/.runtime" && echo ".runtime: $(cat "${CLAUDE_PLUGIN_DATA}/.runtime")" || echo ".runtime: absent, so bun when found and node otherwise"`

With no `config.toml`, the plugin does nothing at all.

## Running it

The hooks need Node 22.6 or newer, or bun on `PATH`, which they prefer when
it is there. On an older Node with no bun, the user sees one line naming the
version needed and the version found, and nothing runs. To force one runtime,
write `node` or `bun` into a `.runtime` file in the data directory:

```sh
echo node > "${CLAUDE_PLUGIN_DATA}/.runtime"
```

## What it does

Each feature works in the main session only, never in a subagent.

- **Context notice.** When the session's context passes the `notice` size,
  Claude is told to recommend `/compact` once the current piece of work ends.
  When it passes `urgent`, Claude recommends it once the step in hand is
  done. Each fires once per climb, and again if the context drops back below
  it and climbs past it again. The sizes come from the first `[models]` row
  that matches the session's model, or from `[default]`.
- **Watcher.** Between `notice` and `urgent`, a small model checks at the end
  of turns whether the session's work has reached a natural end. When it has,
  Claude recommends `/compact` in one sentence.
- **Resume guard.** A resume of a subagent whose context is above `large`, or
  above `cold` once its prompt cache has expired, is refused. The `denied`
  message tells Claude to launch a fresh agent instead, or to ask the user
  with an option labeled "Resume". When the user picks that option, one
  resume goes through. The limits can differ per agent type and per model.
- **Cache wake.** While background work is running and the session sits
  idle, a message arrives shortly before the prompt cache would expire, so
  the cache stays warm. The `[wake]` row for the cache's lifetime sets how
  many wakes one idle stretch gets.

The example configuration switches Haiku off, which turns off both the
context notice and the watcher for it.

Another plugin can turn the context notice and the watcher off for one
session, by writing `<os temp dir>/claude-context-budget/<session id>.unattended`.
den does this while autonomy is on. Deleting that file turns them back on.

For a "why did it" or "why didn't it" question this doesn't answer, read the
Operation and limitations and Troubleshooting sections of
`${CLAUDE_PLUGIN_ROOT}/README.md`.

## Changing the configuration

The hooks read one file:

    ${CLAUDE_PLUGIN_DATA}/config.toml

That directory survives plugin updates. When the file doesn't exist yet,
copy the example, which documents every key:

    cp -n "${CLAUDE_PLUGIN_ROOT}/hooks/config.example.toml" \
      "${CLAUDE_PLUGIN_DATA}/config.toml"

Edit the copy, never the example: a plugin update replaces the example. An
edit takes effect on the next hook run, with no reload. Nothing is merged
under the file, so it needs every key. Read the Configuration section of
`${CLAUDE_PLUGIN_ROOT}/README.md` before an edit: it lists every key, its
type and its default, how a row key is matched, and what each message can
substitute.

Keep an option labeled "Resume" in any rewrite of the `denied` message. The
guard only lets a resume through when the user picked an option whose label
starts with that word, so a message without one leaves no way to approve a
resume.

## When something is wrong

A line starting `context-budget:` reaches Claude, with an instruction to pass
it to the user:

- `parser error`: the TOML parser is missing from the plugin's cache
  directory. Everything is off until it's restored.
- `config error`: the line names a file that can't be read, parsed or used.
  Everything is off until the file is fixed.
- `internal error`: a fault in the plugin itself. Only the feature the line
  names is off, and there's nothing in the configuration to fix.

The line repeats once a turn while the fault stands, and stops on the first
run after it's fixed.

## Checking a change

Run a hook by hand against a real session transcript to see what it will
inject, or what it objects to:

    printf '%s' '{"session_id":"check","transcript_path":"<a .jsonl under ~/.claude/projects/>","hook_event_name":"UserPromptSubmit"}' \
      | node "${CLAUDE_PLUGIN_ROOT}/lib/shared/launch.mjs" --data "${CLAUDE_PLUGIN_DATA}" \
        hooks/context-budget --config "${CLAUDE_PLUGIN_DATA}/config.toml"

It prints the message it would inject, the error line, or nothing when the
context is below `notice`. Delete `claude-context-budget/check.json` from the
OS temp directory afterwards, so the next check starts with no level
recorded.

To check the resume guard, name a subagent of that transcript, one with an
`agent-<id>.jsonl` under `<session id>/subagents/` beside it:

    printf '%s' '{"session_id":"check","transcript_path":"<the .jsonl>","hook_event_name":"PreToolUse","tool_name":"SendMessage","tool_input":{"to":"<id or name>"}}' \
      | node "${CLAUDE_PLUGIN_ROOT}/lib/shared/launch.mjs" --data "${CLAUDE_PLUGIN_DATA}" \
        hooks/resume-guard --config "${CLAUDE_PLUGIN_DATA}/config.toml"

It prints the refusal with its message filled in, or nothing when the resume
is allowed.
