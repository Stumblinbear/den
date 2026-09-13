---
name: plan-page
description: Renders a plan written in the den:slicing shape as one page file, the first screen, a step table and a section per step with its state, pasted code under its caption, coloured diff sketches and the decisions picked out, and sends the file to the user for reading away from the terminal. The argument is the plan file's path and nothing else.
when_to_use: ALWAYS invoke this skill when a plan is put to the user, or when the user asks to see, read or review a plan from a phone or another device. Do not paste the plan or publish it as an artifact directly; use this skill first.
argument-hint: "[path to the plan's markdown file]"
allowed-tools: SendUserFile
---

# A plan as a page

!`node "${CLAUDE_PLUGIN_ROOT}/lib/shared/launch.mjs" --data "${CLAUDE_PLUGIN_DATA}" scripts/plan-page "$ARGUMENTS"`

Send the file the line above names with SendUserFile: `display` render,
`status` normal, and a one-line caption carrying the title and the step
counts from that line. The file is the deliverable; an artifact link is made
only when the user asks for one, since a link is a copy on a server the file
never needed. A line saying why nothing was rendered goes to the user as it
stands.
