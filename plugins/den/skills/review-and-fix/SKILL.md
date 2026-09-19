---
name: review-and-fix
description: How the review-and-fix-workflow workflow is launched on the working tree and what the run does.
when_to_use: ALWAYS invoke this skill when a change in the working tree is ready for review. Do not launch den:reviewer, den:closure-verifier or den:comment-reviewer on a change directly; use this skill first.
user-invocable: false
allowed-tools: Workflow
---

# Review and fix

Run the workflow once the change is in the working tree and the report of
whatever built it is triaged. It reviews the working tree against HEAD, so the
step before is committed first, or against `since` where one is passed.
Stage the tree with `git -C <repo> add -A` before every launch, so a file the
change added is in the index and in the snapshot below.

```
Workflow({
  name: "den:review-and-fix-workflow",
  args: { repo, goal, plan, rulings, reviewer, since },
})
```

| Argument | Value |
| --- | --- |
| `repo` | Required. The absolute path of the repository whose working tree is reviewed. Every agent the run launches works there, whatever directory the session stands in. |
| `goal` | Required. What the change is for, in the user's terms: the plan's `Goal:` line, quoted. It opens the review, the fix brief and the closure launch. |
| `plan` | The plan's path, when the change is a step of one. |
| `rulings` | A list of the decisions the user has settled that a finding could contradict, the rulings on the implementer's report and every skip ruled on an earlier run's return, one decision with its reason per item, each at most 400 characters. The reviewer files a finding that contradicts one as a decision finding, the fixer leaves it and declares it, and the verifier marks it NEEDS-DECISION. |
| `reviewer` | Required. The reviewer's model: `opus`, or `fable` when the change outruns its checks, below. A model the user names for the task wins. |
| `since` | The tree id `git write-tree` printed for the step's last `clean` return (The return, below), on every later run of the step, so the run reads what changed after it. A run before the step's first `clean` return takes none, and reviews against HEAD. |

A change outruns its checks when a wrong result would pass them green: the
correctness argument is a derivation, an algorithm, a numeric method, a
concurrency or memory invariant, a parser or a protocol, and a test only
covers the cases its author thought of. That review goes to `fable`. A change
whose defect a test or a reader catches, control flow, a schema, prose, the
shape of a return, however many files it spans, goes to `opus`, since Fable
draws on a scarcer allowance and an escalation that was not needed costs the
reviews it crowds out later.

Any other key fails the launch.

## The run

The run is one pass and never waits on this session. The reviewer reads the
change and returns findings, nothing else. One Opus fixer takes every finding
at P2 or above as one brief, since a shape one finding names is often written
in more places than the line it cites, and a fixer given one finding at a
time leaves the copies. The closure verifier judges the fixes. A finding it
reopens goes back to a fixer once, carrying the verifier's reason, and is
judged once more. A finding the fixes introduced at P2 or above ends the run
there, since it is a problem the run made and this session reads it before
anything is built on it; one below that line joins `deferred`, and a
decision joins `decisions`, as the reviewer's would. The comment reviewer
runs last, and only over a tree the run left nothing open in.

What the run never touches: a P3 or quality finding, a decision finding and a
pre-existing finding. Each comes back in the return for this session to act
on.

## The return

The return is ruled under `den:triage`, which holds what each of its keys
carries. A run that throws is incomplete, not open: its message names the
cause.

A `clean` return is snapshotted before anything edits the tree:

```
git -C <repo> add -A && git -C <repo> write-tree
```
