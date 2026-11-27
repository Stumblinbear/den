---
name: quality-review
description: How the quality-review-workflow workflow is launched on a change.
when_to_use: ALWAYS invoke this skill when a change that adds names, types or mechanisms is in the working tree and the report of whatever built it is triaged, before review-and-fix runs on it. Do not launch den:quality-reviewer directly; use this skill first.
user-invocable: false
allowed-tools: Workflow
---

# Quality review

Run the quality review before review-and-fix. It finds a wrong shape or a
performance problem while the code is still cheap to change, and
review-and-fix then reviews the code in the shape it will ship in. Rule on
the quality review's findings and get the ones you take fixed, then run
review-and-fix.

The workflow launches one `den:quality-reviewer` on a git diff range and
returns its report. The reviewer is given the arguments below and nothing
else from you. Give each argument only what its row asks for, with no account
of the change in it, such as the choices the implementer declared. The
reviewer reads the diff and the plan on its own, and it takes an account of
the change as already decided, so it reads past the very shapes it is there
to judge.

```
Workflow({
  name: "den:quality-review-workflow",
  args: { repo, range, goal, plan, step, rulings, leadCalls },
})
```

| Argument | Value |
| --- | --- |
| `repo` | Required. The absolute path of the repository the change is in. |
| `range` | Required. The git diff range the change spans, on one line: `--cached HEAD` for the working tree once its changes are staged, `HEAD~1..HEAD` for the last commit. |
| `goal` | Required. What the change is for, in the user's words. When the change serves the plan's `goal`, quote it. Otherwise give the recorded decisions the change serves. |
| `plan` | The plan's absolute path, when the change is a step of a plan. |
| `step` | The ID of the step of the plan that the change is, given only with `plan`. Without it, the reviewer reads every step in progress, so a step running in parallel with this one reads to it as part of this change. |
| `rulings` | The user's rulings on findings that an earlier quality review of this change raised, so that the reviewer doesn't raise them again. Each item is one sentence of at most 400 characters that names the shape the finding flagged, what the user ruled, and why. An item is about its finding only, never an account of the change: the reviewer takes whatever an item says as settled, and reads past the shapes it describes. |
| `leadCalls` | The same as `rulings`, for the calls this session made itself on those findings. |

A key that isn't in this table fails the launch.

## The return

When the run throws, the review didn't happen or didn't finish, and the error
message names the cause. Otherwise the run returns the reviewer's report
exactly as the reviewer wrote it. Each finding starts with a `[quality]` or
`[decision]` line that gives its id, its title and a `path:line`, and the
costliest findings come first. An empty return means the reviewer found
nothing.

The host shows only the first 8,000 characters of the return inline. A
longer report starts with a line giving its length, and the findings past
that point don't show. Read them in the run's output file, which the
completion notice names.

A finding is the reviewer's reading of the code's shape, not a defect. Work
out for yourself the shape the code should have, and take the finding only
where that shape differs from the code in the tree in a way that would cost
the next reader of the code. Otherwise leave the code as it is.

Rule on each finding with the findings of this change's earlier quality
reviews and your calls on them in view, not on its own. When a finding would
undo what an earlier round changed, or reopens a finding an earlier round
settled, decide whether to defer it, rather than taking it as one more round
of fixes to the same change.
