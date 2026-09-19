---
name: review-and-fix
description: How the review-and-fix-workflow workflow is launched on the working tree.
when_to_use: ALWAYS invoke this skill when a change in the working tree is ready for review. Do not launch den:reviewer, den:closure-verifier or den:comment-reviewer on a change directly; use this skill first.
user-invocable: false
allowed-tools: Workflow
---

# Review and fix

Run the workflow once the change is in the working tree and the report of
whatever built it is triaged. It reviews the working tree against HEAD, so the
step before is committed first. Stage the tree with `git -C <repo> add -A`
before every launch.

```
Workflow({
  name: "den:review-and-fix-workflow",
  args: { repo, goal, plan, rulings, leadCalls, reviewer, since },
})
```

| Argument | Value |
| --- | --- |
| `repo` | Required. The absolute path of the repository whose working tree is reviewed. |
| `goal` | Required. What the change is for, in the user's terms: the plan's `Goal:` line, quoted. |
| `plan` | The plan's path, when the change is a step of one. |
| `rulings` | A list of the decisions the user has settled that a finding could contradict, their rulings on the implementer's report and every skip they ruled on an earlier run's return, one decision with its reason per item, each at most 400 characters. |
| `leadCalls` | The same, for this session's own calls: its rulings on the implementer's report and every skip it ruled on an earlier run's return. |
| `reviewer` | Required. The reviewer's model: `opus`, or `fable` when the change outruns its checks, below. A model the user names for the task wins. |
| `since` | The tree id `git write-tree` printed for the step's last `clean` return (The return, below), on every later run of the step. A run before the step's first `clean` return takes none. |

A change outruns its checks when a wrong result would pass them green: the
correctness argument is a derivation, an algorithm, a numeric method, a
concurrency or memory invariant, a parser or a protocol, and a test only
covers the cases its author thought of. That review goes to `fable`. A change
whose defect a test or a reader catches, control flow, a schema, prose, the
shape of a return, however many files it spans, goes to `opus`, since Fable
draws on a scarcer allowance and an escalation that was not needed costs the
reviews it crowds out later.

Any other key fails the launch.

## The return

A run that throws is incomplete, not open: its message names the cause.

A `clean` return is snapshotted before anything edits the tree:

```
git -C <repo> add -A && git -C <repo> write-tree
```
