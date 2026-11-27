---
name: autonomy-stop
description: Ends the session's autonomy, returning every decision, launch and commit to the user's approval, and reports what was done while it ran.
when_to_use: ALWAYS invoke this skill when the user asks for autonomy to stop, and when the task autonomy was started for is done. Do not resume asking for approval or report the run directly; use this skill first.
---

# Ending autonomy

!`node "${CLAUDE_PLUGIN_ROOT}/lib/shared/launch.mjs" --data "${CLAUDE_PLUGIN_DATA}" scripts/autonomy stop "${CLAUDE_SESSION_ID}"`

Open your reply by telling the user that autonomy is off. If a line above says
autonomy was not changed, tell them it is still on, and why. If a line above is
about context-budget's switch, pass that line on.

Then report what was done while autonomy was on, from `.local/autonomy-log.md`
and the plan's proposals with status `notRaised`:

- each decision made on the user's behalf, with what it was chosen over;
- what was downloaded or installed;
- each blocker, with the branch that holds its work;
- what is left to do.
