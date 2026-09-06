---
name: flag-review
description: Runs the flag-review workflow on the pending diff, a bug hunter, a quality reviewer and a decisions reviewer each reading it blind to the others and a synthesizer writing one ranked report. The argument is a git diff range and nothing else (revisions, optionally `-- paths`), never a description of the scope; omit it to review the working tree against HEAD.
argument-hint: "[git diff range only, e.g. HEAD~1 or main..HEAD; omit for the working tree]"
user-invocable: false
allowed-tools: Workflow
---

# Flag review

Run the workflow with the scope as a git diff range and nothing else, since
a reader given a description reads for it:

```
Workflow({
  scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/flag-review.js",
  args: { scope },
})
```

where `scope` is `$ARGUMENTS`, or `the working tree against HEAD` when that
is empty. It returns the report; triage it under the coordination skill's
review rules.
