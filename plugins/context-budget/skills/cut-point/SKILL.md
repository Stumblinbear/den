---
name: cut-point
description: Use when you need a prompt to name as a rewind cut point: the user asks where to rewind to or which prompt to select in `/rewind`, or the cut point you named earlier has expired.
---

# A current rewind cut point

A rewind at a prompt re-reads everything before it, which is cached only while the prompt is younger than the session's cache lifetime. The command below reads the transcript and lists three cached prompts spread across the context — the oldest, the newest, and the one closest to halfway between them by size — each with what a cut there summarizes away, what it keeps verbatim, and how many more turns the session has to take before the cut has paid for itself; every prompt after the first one listed is cached too.

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/cut-point.mjs" --pricing "${CLAUDE_PLUGIN_ROOT}/hooks/pricing.toml" --pricing-overrides "${CLAUDE_PLUGIN_DATA}/pricing.toml"`

## Choosing

Each listed prompt shows what a cut there summarizes away and what it keeps verbatim. The kept stretch is written back to the cache when the rewind lands, at the write price — twice a fresh input token on the one-hour lifetime, 1.25 times on the five-minute — so a cut that keeps most of the context costs about what it saves; that is the case for a newer cut with a focus line, or for `/compact`.

Prefer a cut whose payback is well inside the number of turns the work still has to take: past that point the cut has cost more than it saved, and a payback of forty turns in a task with ten left in it is money spent for nothing. When every listed payback is beyond what the work needs, say so and recommend carrying on, or `/compact <focus line>` if the context has to come down anyway. The figure assumes the session keeps working; a pause longer than the cache lifetime makes the next turn rewrite the whole context whether or not there was a cut, so a cut pays for itself sooner in a session that stops and starts — the figure never includes that, and it is the one thing that makes it pessimistic.

Name the oldest listed prompt that is at or after the start of the current task: older, and the cut keeps the end of the previous task verbatim as dead weight, so the next threshold comes sooner; newer, and the summary swallows setup the task still leans on. If the task began after every listed prompt, name its first prompt; it is newer than the last one listed, so it is cached. Right after a compaction, the kept prompts and everything since are all cheap to cut at, and there is rarely anything worth cutting yet. When nothing is listed, the reading says why and what to recommend instead.

## Saying it

Give the user, in one short passage: the direction by name, "Summarize up to here", which keeps everything from that prompt on verbatim; the prompt's opening words quoted verbatim, since the picker lists their prompts and a position like "three prompts ago" does not survive scrolling; "valid until HH:MM" from the list, after which the same rewind re-reads the whole prefix at full price; and that they can ask you for another cut point if they miss it. Only the user can run `/rewind`; the direction is chosen in its picker after the prompt is selected.
