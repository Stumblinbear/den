---
name: review-and-fix
description: How the review-and-fix-workflow workflow is launched on the working tree.
when_to_use: ALWAYS invoke this skill when a change in the working tree is ready for review. Do not launch den:reviewer, den:finding-fixer, den:closure-verifier or den:comment-reviewer on a change directly; use this skill first.
user-invocable: false
allowed-tools: Workflow
---

# Review and fix

Run the workflow once all of these hold:

- the change is in the working tree;
- you have triaged the report of whatever built the change;
- when the change adds names, types or mechanisms, its quality review
  (`den:quality-review`) has run, and you have ruled on its findings and had
  the ones you took fixed.

The workflow reviews the working tree against HEAD, so before you launch it,
commit every step that this one comes after. The working tree then holds
this step's change and nothing else.

```
Workflow({
  name: "den:review-and-fix-workflow",
  args: { repo, goal, plan, step, rulings, leadCalls, reviewer, since },
})
```

| Argument | Value |
| --- | --- |
| `repo` | Required. The absolute path of the repository whose working tree is reviewed. |
| `goal` | Required. What the change is for, in the user's words. When the change serves the plan's `goal`, quote it. Otherwise give the recorded decisions the change serves. |
| `plan` | The plan's absolute path, when the change is a step of a plan. |
| `step` | The ID of the step of the plan that the change is, given only with `plan`. Without it, the agents read every step in progress, so the work of a step running in parallel with this one reads to them as work this change left undone. |
| `rulings` | The user's rulings on the findings and questions of an earlier run on this change: each finding the user ruled to skip, and each answer to a decision finding. Each item is one sentence of at most 400 characters that names the behaviour the finding flagged, what the user ruled, and why. The reviewer, the fixer and the verifier all take every item as settled, so an item that describes the code without ruling on a finding is taken as true, and its claim about the code never gets the checking it needed. An example item: `A missing config key reads as its default rather than failing, since every caller handles the default and a hard failure would stop startup on an optional key.` A statement of the design, such as `Writes go through the queue and reads hit the store directly`, belongs in the plan and stays out of `rulings`. |
| `leadCalls` | The same as `rulings`, for the calls you made yourself on an earlier run's findings and questions. |
| `reviewer` | Required. The model the review runs on: `opus`, or `fable` when a wrong result in the change could pass its checks, as the paragraph below the table explains. When the user names a model for the task, pass that one. |
| `since` | On every run of the step after its first `clean` return: the tree id that the `snapshot` command of the step's last `clean` return printed. Leave it out until the step has had a `clean` return. |

A key that isn't in this table fails the launch.

Pass `fable` when a wrong result in the change would still pass its checks
green. That is the case when the argument that the change is correct is a
derivation, an algorithm, a numeric method, a concurrency or memory
invariant, a parser or a protocol, since a test covers only the cases its
author thought of. Pass `opus` when a test or a reader would catch the
change's defects, as in control flow, a schema, prose or the shape of a
return value, however many files the change spans. Fable draws on a scarcer
allowance, so a review sent to Fable that Opus could have done uses up
allowance that later reviews need.

## The return

When the run throws, it didn't finish, which is a different outcome from an
`open` return. The error message names the cause.

`status` is `clean` when the verifier closed every finding the run set out to
fix and the fixes introduced no finding at P0, P1 or P2. Otherwise it is
`open`. `status`, `carried` and `passes` are always in the return, and a
`clean` return also carries `snapshot`, the command whose output `since`
takes. Every other key appears only when it holds something:

- `open`: the findings the run couldn't close, each in full, with its
  `verdict` and the verifier's `reason`. The verdict is one of these:
  - REOPENED: the second fix pass didn't close the finding, or the run
    stopped after the first pass on a finding the fixes introduced.
  - NEEDS-DECISION: only a ruling can settle the finding, including what
    becomes of any fix for it that is already in the tree.
- `introduced`: the findings at P0, P1 or P2 that the fixes introduced, each
  in full. The run stopped as soon as they were found.
- `decisions`: the decision findings of the reviewer and of the verifier,
  each in full, for the user to decide.
- `deferred`: the P3 findings, each in full. When the reviewer wrote a
  failing test for one, the test is still in the tree, and the finding's
  evidence names it.
- `comment`, on a `clean` run only: the comment pass's `counts` and its
  `gaps`. A gap is a comment the pass kept although no code it read shows
  that the comment's claim holds.
- `carried`: what the fixers declared, which is their `deviations`, their
  `choices` (each giving what the fixer `chose` and what it chose that
  `over`) and their `unsure` items, along with the `preExisting` findings.
  Triage it the way you triage an implementer's report.
- `passes`: the run's own account of what it did, one record per fix pass.
  Each record lists the pass's findings with their verdicts, and the
  verifier's reason for every verdict other than CLOSED.

Read what the run did from `passes`, and leave the agents' transcripts and
the run's journal closed. The return holds every item exactly as its writer
wrote it, and a ruling or a triage turns on those exact words, so the
transcripts have nothing to add.

## Ruling the return

Triage the return as one list, and make your own call on each item in it. A
finding the run fixed and the verifier closed needs no call.

Send every call that changes the tree to one fixer in one brief: a finding
left open, a decision finding ruled to be fixed, and the `deferred` findings
you choose to fix. A problem one finding names is often written in more
places than the line it cites, and the items came from one read of the
change. A fixer given the items one at a time fixes each cited line and
leaves the other copies of the problem in place.

Defer a finding when it lies outside what the change depends on, or when no
input that can reach the code triggers it. How long the defect has been in
the code is no reason to defer it.
