---
name: diff-page
description: Renders a git diff range as one page file, a collapsible section per file with old and new line numbers and coloured lines, and sends the file to the user for reading away from the terminal. The argument is a git diff range and nothing else (revisions, optionally `-- paths`); omit it for the working tree against HEAD.
when_to_use: ALWAYS invoke this skill when the user asks to see, read or review a diff from a phone or another device, or asks for a change as a page. Do not paste the diff or publish it as an artifact directly; use this skill first.
argument-hint: "[git diff range, e.g. HEAD~1 or main..HEAD; omit for the working tree]"
allowed-tools: SendUserFile
---

# A diff as a page

!`node "${CLAUDE_PLUGIN_ROOT}/lib/shared/launch.mjs" --data "${CLAUDE_PLUGIN_DATA}" scripts/diff-page "$ARGUMENTS"`

Send the file the line above names with SendUserFile: `display` render,
`status` normal, and a one-line caption carrying the range and the counts
from that line. The file is the deliverable; an artifact link is made only
when the user asks for one, since a link is a copy on a server the file never
needed. A line saying the diff is empty, or why nothing was rendered, goes to
the user as it stands.
