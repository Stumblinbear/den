---
name: cut-point
description: Use when you need a prompt to name as a rewind cut point: the user asks where to rewind to or which prompt to select in `/rewind`, or the cut point you named earlier has expired.
---

# A current rewind cut point

A rewind at a prompt re-reads everything before it, which is cached only while the prompt is younger than the session's cache lifetime. The command below reads the transcript and lists three cached prompts spread across the context — the oldest, the newest, and the one closest to halfway between them by size — each with what a cut there summarizes away and what it keeps verbatim; every prompt after the first one listed is cached too.

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/cut-point.mjs"`

## Choosing

Each listed prompt shows what a cut there summarizes away and what it keeps verbatim. The kept stretch is written back to the cache at full price when the rewind lands, so a cut that keeps most of the context costs about what it saves; that is the case for a newer cut with a focus line, or for `/compact`.

Name the oldest listed prompt that is at or after the start of the current task: older, and the cut keeps the end of the previous task verbatim as dead weight, so the next threshold comes sooner; newer, and the summary swallows setup the task still leans on. If the task began after every listed prompt, name its first prompt; it is newer than the last one listed, so it is cached. Right after a compaction, the kept prompts and everything since are all cheap to cut at, and there is rarely anything worth cutting yet. When nothing is listed, the reading says why and what to recommend instead.

## Saying it

Give the user, in one short passage: the direction by name, "Summarize up to here", which keeps everything from that prompt on verbatim; the prompt's opening words quoted verbatim, since the picker lists their prompts and a position like "three prompts ago" does not survive scrolling; "valid until HH:MM" from the list, after which the same rewind re-reads the whole prefix at full price; and that they can ask you for another cut point if they miss it. Only the user can run `/rewind`; the direction is chosen in its picker after the prompt is selected.
