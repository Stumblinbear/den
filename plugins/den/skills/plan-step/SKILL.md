---
name: plan-step
description: Reads one step of a plan; the argument is the plan's JSON path, then the step's ID.
argument-hint: "[path to the plan's JSON file] [step ID, or none for the steps in progress, or every step when none is]"
user-invocable: false
---

# A step of a plan

Below are the parts of the plan that hold for every step, such as its goal and
constraints, then each step the first line names, in full, with what it relies
on. If the plan or the step could not be read, only the reason is below.

The first line also lists every problem found in the plan, such as a step with
no ID, and every file the plan points to that could not be read. Report each
one to whoever gave you the plan, since the plan is theirs to fix.

!`node "${CLAUDE_PLUGIN_ROOT}/lib/shared/launch.mjs" --data "${CLAUDE_PLUGIN_DATA}" scripts/plan-step "$ARGUMENTS"`
