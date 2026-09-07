---
name: design-exploration
description: Launches three independent design explorers against the task's design basis, then a judge assessing suitability, and brings the recommendation or unresolved decisions to the user.
when_to_use: ALWAYS invoke this skill when a change adds a module, a persisted format, a public surface or a new mechanism and its brief is not yet written. Do not choose the decomposition or write the brief directly; use this skill first.
user-invocable: false
allowed-tools: Workflow
---

# Design exploration

Run the workflow with the ask, design basis and decisions as `den:scoping`
settled them. Keep the basis's sources and confirmed statements distinct from
assumptions. Give explorers the requirements and settled constraints, while
leaving the decomposition open for their independent judgment:

```
Workflow({
  scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/design-exploration.js",
  args: { ask, basis, decisions },
})
```

`basis` is nonempty text of at most 6000 characters; include only context that
can affect the choice, and state missing direction explicitly. `decisions`
remains optional. Preserve consequential uncertainty rather than trimming it
away to fit.

It returns every proposal with its angle and the judge's assessment. Give the
user the recommendation, decisive tradeoffs and unresolved questions, and wait
for their choice. Outcome `needs-input` calls for the missing decision;
`no-suitable-proposal` calls for revising the proposals or their constraints.
Neither selects a design. A failed workflow is incomplete, not a clean
assessment. The brief pins the user's choice and its reasons.
