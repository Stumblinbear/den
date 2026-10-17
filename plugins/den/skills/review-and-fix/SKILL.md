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
| `goal` | Required. What the change is for, in the user's terms: the plan's `goal`, quoted. |
| `plan` | The plan's path, when the change is a step of one. |
| `rulings` | The user's rulings on an earlier run's findings and questions: each skip, and each answer to a decision finding, one per item in one sentence of at most 400 characters naming the behaviour the finding flagged, what was ruled, and why. The reviewer, the fixer and the verifier take every item as settled, so an item that describes code without ruling on it ends the checking its claim needed. An item: `A missing config key reads as its default rather than failing, since every caller handles the default and a hard failure would stop startup on an optional key.` A design statement, `Writes go through the queue and reads hit the store directly`, is the plan's and stays out. |
| `leadCalls` | The same, for this session's own calls on an earlier run's findings and questions. |
| `reviewer` | Required. The reviewer's model: `opus`, or `fable` when the change outruns its checks, below. A model the user names for the task wins. |
| `since` | The tree id `git write-tree` printed for the step's last `clean` return, on every later run of the step. A run before the step's first `clean` return takes none. |

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

`status` is `clean` when every finding the run fixed closed and nothing was
introduced; `open` otherwise. `carried` and `passes` always come back; every
other key is present only when it holds something:

- `open`: findings the run could not close, each whole with its `verdict`
  and the verifier's `reason`: REOPENED after the second pass, or
  NEEDS-DECISION, where a fix is in the tree and only a ruling says what
  becomes of it.
- `introduced`: findings at P2 or above the fixes introduced, whole. The
  run stopped on them.
- `decisions`: the reviewer's decision findings, whole, for the user to
  decide.
- `deferred`: the P3 findings, whole, with the test the reviewer left in the
  tree for each named in its evidence.
- `comment`, on a clean run: the comment pass's `counts` and its `gaps`, each
  a comment kept although no code the pass read shows its claim.
- `carried`: the fixers' `deviations`, `choices` (each what it `chose` and
  what it was chosen `over`) and `unsure` items, and `preExisting` findings,
  triaged as an implementer's report is.
- `passes`: the run's account of itself, one record per fix pass, each
  finding with its verdict and, where the verdict is not CLOSED, the
  verifier's reason.

What the run did is read from `passes`, and the transcripts and the journal
stay closed: what the return holds arrives word for word, since a ruling and
a triage turn on the words their writer chose. Findings the run fixed and
closed take no call.

## Ruling the return

The return is triaged as one list: each item gets this session's call, and
every call that changes the tree, a finding left open, a decision ruled fix, a
sweep of `deferred`, goes to one fixer in one brief, since the items were
found in one read and a fixer given them one at a time leaves the copies.

You defer a finding when it lies outside what the change depends on or no
reachable input triggers it; its age is no reason.
