---
name: design-exploration
description: Launches three independent design explorers against the project's direction record, then a judge assessing suitability, and brings the recommendation or unresolved decisions to the user.
when_to_use: ALWAYS invoke this skill when a change adds a module, a persisted format, a public surface or a new mechanism and its brief is not yet written. Do not choose the decomposition or write the brief directly; use this skill first.
user-invocable: false
allowed-tools: Workflow
---

# Design exploration

Run the workflow with the ask, the direction record's path and the decisions
`den:scoping` settled. Give explorers the requirements and settled
constraints, while leaving the decomposition open for their independent
judgment:

```
Workflow({
  name: "den:design-exploration-workflow",
  args: { ask, direction, decisions, explorer },
})
```

`direction` is the absolute path of the project's direction record, the file
or the directory `den:direction-docs` keeps; the explorers and the judge read
it themselves, so what scoping clarified reaches them only once it is in the
record. `decisions` is an optional list, one settled decision with its reason
per item, at most 400 characters each. `explorer` is required, the model the
three explorers run on. It is `fable` only on the user's approval: propose
Fable explorers, with the reason, when the design's correctness rests on a
concurrency or memory invariant, a protocol or a lifetime across threads, and
launch every other exploration on `opus`, since an exploration spends three
runs of Fable's scarcer allowance. A model the user names wins. The judge runs
on Opus either way.

It returns every proposal with its angle and the judge's assessment. Give the
user the recommendation, decisive tradeoffs and unresolved questions, and wait
for their choice. Outcome `needs-input` calls for the missing decision;
`no-suitable-proposal` calls for revising the proposals or their constraints.
Neither selects a design. A failed workflow is incomplete, not a clean
assessment. The brief pins the user's choice and its reasons.
