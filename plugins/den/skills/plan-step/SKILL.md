---
name: plan-step
description: Reads one step of a plan; the argument is the plan's JSON path, then the step's number.
argument-hint: "[path to the plan's JSON file] [step number, or none for the step in progress]"
user-invocable: false
---

# A step of a plan

Below is the step, with the plan's goal and what the step relies on, or the
reason it could not be read. The step's first line names any problem in the
plan and any source that could not be read: report each to whoever gave you
the plan, since the plan is theirs to fix.

!`node "${CLAUDE_PLUGIN_ROOT}/lib/shared/launch.mjs" --data "${CLAUDE_PLUGIN_DATA}" scripts/plan-step "$ARGUMENTS"`
