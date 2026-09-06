---
name: cut-point
description: A priced reading of the session's prompt cache, listing the rewind cut points still cached, `/compact`, and carrying on, each with what it keeps and when it pays back.
when_to_use: ALWAYS invoke this skill when naming where to rewind to or which prompt to select in `/rewind` or when a cut point named earlier has expired. Do not name a cut point or quote a payback from memory; use this skill first.
---

# A current rewind cut point

A rewind at a prompt re-reads everything before it, cached only while the prompt is younger than the session's cache lifetime.

!`node "${CLAUDE_PLUGIN_ROOT}/lib/shared/launch.mjs" --data "${CLAUDE_PLUGIN_DATA}" scripts/cut-point --session "${CLAUDE_SESSION_ID}" --pricing "${CLAUDE_PLUGIN_ROOT}/lib/pricing.toml" --pricing-overrides "${CLAUDE_PLUGIN_DATA}/pricing.toml"`

## Choosing

The arc rules on what is admissible before any figure is read: whatever the next steps still lean on has to survive verbatim. That rules `/compact` out where the tail it keeps would not hold that setup, however cheap the row looks, and it admits a rewind only at a prompt the arc began at or after, the oldest listed one that qualifies; the `context-budget` skill's "Naming the cut point" says which prompt that is. If the arc began after every listed prompt, no cut point is admissible, and the choice is `/compact <focus line>` or carrying on, on the figures below.

Price then chooses among what the arc admits: the lowest payback, and `/compact` where two of them tie. The payback is how many more turns the work must take before the option has saved more than it cost, so carrying on, the last row, wins whenever every payback is longer than the arc has left to run; say so rather than recommending a cut the session will not live to earn back. The `/compact` row is priced on an estimated tail, so a turn or two between it and a cut is inside that estimate. Every figure assumes the session keeps working, so all of them are pessimistic for one that pauses past the cache lifetime, where the next turn rewrites the whole context either way.

## Saying it

Give the user, in one short passage: the direction by name, "Summarize up to here"; the prompt's opening words quoted verbatim, since the picker lists their prompts and a position like "three prompts ago" does not survive scrolling; "valid until HH:MM" from the list; and that they can ask you for another cut point if they miss it. Only the user can run `/rewind`; the direction is chosen in its picker after the prompt is selected. A user working from Remote Control cannot open that picker at all, so recommend `/compact <focus line>` there instead.

Say a `/compact` as the command with its focus line written out, whose shape is in the `context-budget` skill, and one clause of why: what it summarizes away against what carrying on costs a turn. Quote no expiry and name no prompt, since it selects none and nothing about it goes stale, and either of you can run it.
