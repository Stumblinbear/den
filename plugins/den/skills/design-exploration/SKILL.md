---
name: design-exploration
description: Launches three independent design explorers against the project's direction record, then a judge assessing suitability, and brings the recommendation or unresolved decisions to the user.
disable-model-invocation: true
allowed-tools: Workflow
---

# Design exploration

Run the workflow with the ask, the direction record's path and the decisions
`den:scoping` settled:

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
runs of Fable's scarcer allowance. A model the user names wins.

The `ask` states the outcome that must hold and leaves every mechanism to the
explorers, since an ask written as a mechanism comes back as three variants of
it and the design worth the run is the one nobody in the conversation had. A
`decisions` entry is a decision the user made, with their reason; a conclusion
this session reached goes in as the outcome it was meant to buy, so an
explorer can reach it another way. A returned design may change what the work
is, and that is the run paying for itself rather than a proposal out of scope.

Give the user the recommendation, decisive tradeoffs and unresolved questions,
and wait for their choice. Outcome `needs-input` calls for the missing
decision; `no-suitable-proposal` calls for revising the proposals or their
constraints. Neither selects a design: resolve the consequential uncertainty
with the user before dependent implementation, since neither a question budget
nor a ranking supplies approval. A failed workflow is incomplete, not a clean
assessment.
