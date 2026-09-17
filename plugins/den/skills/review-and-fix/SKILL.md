---
name: review-and-fix
description: How the review-and-fix-workflow workflow is launched on the working tree and what its return holds.
when_to_use: ALWAYS invoke this skill when a change in the working tree is ready for review, and when a review-and-fix-workflow run returns. Do not launch den:reviewer, den:closure-verifier or den:comment-reviewer on a change directly; use this skill first.
user-invocable: false
allowed-tools: Workflow
---

# Review and fix

Run the workflow once the change is in the working tree and the report of
whatever built it is triaged. It reviews the working tree against HEAD, so the
step before is committed first.

```
Workflow({
  name: "den:review-and-fix-workflow",
  args: { repo, goal, plan, rulings, reviewer },
})
```

| Argument | Value |
| --- | --- |
| `repo` | Required. The absolute path of the repository whose working tree is reviewed. Every agent the run launches works there, whatever directory the session stands in. |
| `goal` | Required. What the change is for, in the user's terms: the plan's `Goal:` line, quoted. It opens the review, the fix brief and the closure launch. |
| `plan` | The plan's path, when the change is a step of one. |
| `rulings` | A list of the decisions the user has settled that a finding could contradict, the rulings on the implementer's report and every skip ruled on an earlier run's return, one decision with its reason per item, each at most 400 characters. The reviewer files a finding that contradicts one as a decision finding, the fixer leaves it and declares it, and the verifier marks it NEEDS-DECISION. |
| `reviewer` | Required. The reviewer's model: `opus`, or `fable` when the change outruns its checks, below. A model the user names for the task wins. |

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

`status` is `clean` when every finding the run fixed closed and nothing was
introduced, so the comment pass ran; `open` otherwise. `carried` and
`passes` always come back; every other key is present only when it holds
something, and the ones this session acts on come first, since the host cuts
a long result at its tail:

- `open`: findings the run could not close, each whole with its `verdict`
  and the verifier's `reason`: REOPENED after the second pass, or
  NEEDS-DECISION, where a fix is in the tree and only a ruling says what
  becomes of it.
- `introduced`: findings at P2 or above the fixes introduced, whole. The
  run stopped on them.
- `decisions`: the reviewer's decision findings, whole, for the user under
  the lead skill's Whose call.
- `deferred`: the P3 and quality findings, whole, with the test the reviewer
  left in the tree for each named in its evidence. One fork sweeps them, or
  the user leaves them.
- `comment`, on a clean run: the comment pass's `counts` and its `gaps`, each
  a comment kept although no code the pass read shows its claim, which the
  commit proposal lists.
- `carried`: the fixers' `deviations`, `choices` (each what it `chose` and
  what it was chosen `over`) and `unsure` items, and `preExisting` findings,
  triaged as an implementer's report is.
- `passes`: the run's account of itself, one record per fix pass, each
  finding with its verdict and, where the verdict is not CLOSED, the
  verifier's reason. What a fixer verified stays in the journal.

Everything the return holds is this session's to settle. A fixer for what it
rules is launched through the Agent tool as a standing implementer, briefed
with the findings and the calls on them as one change. A tree changed that
way is reviewed again by a fresh run over the whole change, since a fix is
read in the change it fixes. A run that throws is incomplete, not open: its
message names the cause.
