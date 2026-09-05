---
name: cut-point
description: Use when you need a prompt to name as a rewind cut point: the user asks where to rewind to or which prompt to select in `/rewind`, or the cut point you named earlier has expired.
---

# A current rewind cut point

A rewind at a prompt re-reads everything before it, cached only while the prompt is younger than the session's cache lifetime.

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/cut-point.mjs" --pricing "${CLAUDE_PLUGIN_ROOT}/hooks/pricing.toml" --pricing-overrides "${CLAUDE_PLUGIN_DATA}/pricing.toml"`

## Choosing

Name the oldest listed prompt at or after the start of the current task: older, and the cut keeps the end of the previous task verbatim as dead weight, so the next threshold comes sooner; newer, and the summary swallows setup the task still leans on. If the task began after every listed prompt, name its first prompt; it is newer than the last one listed, so it is cached.

The payback is how many more turns the work must take before the cut has saved more than it cost. Prefer a cut whose payback sits well inside that; when every listed payback is beyond it, say so and recommend carrying on, or `/compact <focus line>` if the context has to come down anyway. The figure assumes the session keeps working, so it is pessimistic for one that pauses past the cache lifetime, where the next turn rewrites the whole context either way.

## Saying it

Give the user, in one short passage: the direction by name, "Summarize up to here"; the prompt's opening words quoted verbatim, since the picker lists their prompts and a position like "three prompts ago" does not survive scrolling; "valid until HH:MM" from the list; and that they can ask you for another cut point if they miss it. Only the user can run `/rewind`; the direction is chosen in its picker after the prompt is selected.
