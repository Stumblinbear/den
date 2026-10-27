---
name: quality-review
description: How the quality-review-workflow workflow is launched on a change.
when_to_use: ALWAYS invoke this skill when a change adds names, types or mechanisms and is ready for its quality review. Do not launch den:quality-reviewer directly; use this skill first.
user-invocable: false
allowed-tools: Workflow
---

# Quality review

The workflow runs one `den:quality-reviewer` over a diff range and returns its
report. Its arguments are the whole launch: the reviewer reads the diff and
the plan itself, and an account of the change, such as the implementer's
declared choices, reads to it as settled, so it reads past the shapes the
review is for.

```
Workflow({
  name: "den:quality-review-workflow",
  args: { repo, range, goal, plan, rulings, leadCalls },
})
```

| Argument | Value |
| --- | --- |
| `repo` | Required. The absolute path of the repository the change is in. |
| `range` | Required. The git diff range the change spans, on one line: `--cached HEAD` for a staged working tree, `HEAD~1..HEAD` for the last commit. |
| `goal` | Required. What the change is for, in the user's terms: the plan's `goal`, quoted. |
| `plan` | The plan's absolute path, when the change is a step of one. |
| `rulings` | The user's rulings on findings an earlier quality review of this change raised, one per item in one sentence of at most 400 characters naming the shape the finding flagged, what was ruled, and why. An item clarifies a finding and is never an account of the change, since the reviewer takes what an item says as settled and reads past the shapes it describes. The reviewer does not raise a ruled finding again. |
| `leadCalls` | The same, for this session's own calls on those findings. |

Any other key fails the launch.

## The return

A run that throws is incomplete: its message names the cause. Otherwise the
return is the reviewer's report as it wrote it, each finding opened by a
`[quality]` or `[decision]` line with its id, title and `path:line`, the
costliest first. An empty return is a review that found nothing. A report
longer than the 8,000 characters the host shows inline opens with a line
giving its length; the findings past that are in the run's output file, which
the completion notice names, so the rest is read there.
