---
name: design-exploration
description: Launches the design-exploration workflow, three explorers each proposing a decomposition for one change against the code and a judge ranking them, and brings the ranking to the user to choose from.
when_to_use: ALWAYS invoke this skill when a change adds a module, a persisted format, a public surface or a new mechanism and its brief is not yet written. Do not choose the decomposition or write the brief directly; use this skill first.
user-invocable: false
allowed-tools: Workflow
---

# Design exploration

Run the workflow with the ask as `den:scoping` settled it and the decisions
it settled as `decisions`, and nothing else in either, since an explorer
given a leaning proposes that leaning:

```
Workflow({
  scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/design-exploration.js",
  args: { ask, decisions },
})
```

It returns every proposal with its angle and the judge's ranking. Give the
user the ranking with each proposal's strengths and costs in the judge's
words and where they differ, and wait: a decomposition is expensive to
reverse, which is why the choice is theirs. The brief pins what they chose.
