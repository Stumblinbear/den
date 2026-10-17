---
name: plan-step
description: Writes one step of a plan to a file an agent reads, with the plan's goal and what the step relies on.
argument-hint: "[path to the plan's JSON file] [step number, or none for the step in progress]"
user-invocable: false
---

# A step of a plan

!`node "${CLAUDE_PLUGIN_ROOT}/lib/shared/launch.mjs" --data "${CLAUDE_PLUGIN_DATA}" scripts/plan-step "$ARGUMENTS"`

Read the file the line above names. Report any problem the line names to
whoever gave you the plan, since the plan is theirs to fix.
