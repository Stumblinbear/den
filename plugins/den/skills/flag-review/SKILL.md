---
name: flag-review
description: Runs the flag-review workflow on the pending diff, a bug hunter, a quality reviewer and a decisions reviewer each reading it blind to the others and a synthesizer writing one ranked report. The argument is a git diff range and nothing else (revisions, optionally `-- paths`), never a description of the scope; omit it to review the working tree against HEAD.
argument-hint: "[git diff range only, e.g. HEAD~1 or main..HEAD; omit for the working tree]"
user-invocable: false
allowed-tools: Workflow
---

# Flag review

Keep the public scope argument a Git diff range. Pass the relevant design basis
from scoping or the task brief separately, with its sources and the distinction
between confirmed requirements and assumptions intact. Readers share those
requirements, not the coordinator's suspected findings or preferred verdict:

```
Workflow({
  scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/flag-review.js",
  args: { scope, basis },
})
```

where `scope` is `$ARGUMENTS`, or `the working tree against HEAD` when that
is empty. `basis` is optional nonempty text of at most 6000 characters; omit it
for standalone reviews with no supplied context. Readers may use relevant
repository documents, and missing intent limits conclusions about project fit.

It returns findings and unresolved questions as separate parts of one report;
triage both under coordination's review rules. A reader failure makes the
review incomplete rather than a report with fewer readers and no findings.
