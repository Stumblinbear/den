---
name: autonomy-stop
description: Ends the session's autonomy, returning every decision, launch and commit to the user's approval, and reports what was done while it ran.
when_to_use: ALWAYS invoke this skill when the user asks for autonomy to stop, and when the task autonomy was started for is done. Do not resume asking for approval or report the run directly; use this skill first.
---

# Ending autonomy

!`node "${CLAUDE_PLUGIN_ROOT}/lib/shared/launch.mjs" --data "${CLAUDE_PLUGIN_DATA}" scripts/autonomy stop "${CLAUDE_SESSION_ID}"`

Invoking this skill turned autonomy off, unless a line above says nothing
changed. From then, the lead skill's rules on whose call a decision is, on
launches and on commits applied again. den's hooks say whether autonomy is on
now; this text does not.

Report to the user what happened while it ran, from `.local/autonomy-log.md`
and the plan's proposals with status `notRaised`:

- the decisions made on their behalf, each with what it was chosen over;
- what was downloaded or installed;
- each blocker and the branch holding its work;
- what is left to do.
