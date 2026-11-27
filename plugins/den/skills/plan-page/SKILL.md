---
name: plan-page
description: Renders a plan file as one page and sends it to the user.
argument-hint: "[path to the plan's JSON file]"
allowed-tools: SendUserFile
user-invocable: false
---

# A plan as a page

!`node "${CLAUDE_PLUGIN_ROOT}/lib/shared/launch.mjs" --data "${CLAUDE_PLUGIN_DATA}" scripts/plan-page "$ARGUMENTS"`

The line above is what the plan-page script printed. Act on it by what it
reports:

- **A problem in a plan this session wrote,** such as JSON that doesn't parse
  or a source that couldn't be read: fix the plan and invoke this skill again
  before you send the user anything.
- **A page with no problem:** send the page with SendUserFile, with `display`
  set to `render`, `status` set to `normal`, and a one-line caption giving the
  title and the step counts from the line.
- **Any other line:** give the user the line as it stands, and when it names a
  page, send that page as above.

The page is what this skill delivers, so publish it as an artifact only when
the user asks for a link.
