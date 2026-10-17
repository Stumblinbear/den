---
name: plan-page
description: Renders a plan file as one page and sends it to the user.
argument-hint: "[path to the plan's JSON file]"
allowed-tools: SendUserFile
user-invocable: false
---

# A plan as a page

!`node "${CLAUDE_PLUGIN_ROOT}/lib/shared/launch.mjs" --data "${CLAUDE_PLUGIN_DATA}" scripts/plan-page "$ARGUMENTS"`

Send the file the line above names with SendUserFile: `display` render,
`status` normal, and a one-line caption carrying the title and the step counts
from that line. The file is the deliverable; an artifact link is made only
when the user asks for one.

When the line names a problem in a plan this session wrote, such as JSON that
does not parse or sources that could not be read, fix the plan and invoke this
skill again before sending anything. Any other line goes to the user as it
stands.
