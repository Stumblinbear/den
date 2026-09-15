---
name: review-and-fix
description: How the review-and-fix-workflow workflow is launched on the working tree and relaunched with the answers to each stop.
when_to_use: ALWAYS invoke this skill when a change in the working tree is ready for review, and when a review-and-fix-workflow run returns. Do not launch den:reviewer, den:closure-verifier or den:comment-reviewer on a change, or answer a stopped run, directly; use this skill first.
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
  args: { goal, plan, basis, rulings, reviewer, fixRounds: 3 },
})
```

| Argument | Value |
| --- | --- |
| `goal` | Required. What the change is for, in the user's terms: the plan's `Goal:` line, quoted. It opens the review and every fix and closure launch. |
| `plan` | The plan's path, when the change is a step of one. |
| `basis` | Required. The design basis, at most 6000 characters. |
| `rulings` | The rulings on the implementer's report, the departures accepted and the choices confirmed, at most 6000 characters. A fixer leaves unfixed a finding whose fix would undo one, and the run stops on it. |
| `reviewer` | Required. The reviewer's model: `opus`, or `fable` when the change outruns its checks, below. A model the user names for the task wins. |
| `fixRounds` | Required. 3. The fix rounds that run before the run stops to ask for more. |
| `answers` | Only on a relaunch. |

A change outruns its checks when nothing outside the model separates a
correct result from a plausible wrong one before it is expensive to undo: no
test or type tells them apart, the defect would live in how several files
relate rather than in any one of them, or the change touches what the project
marks as governing. That review goes to `fable`, and every other goes to
`opus`, since Fable draws on a scarcer allowance and an escalation that was
not needed costs the reviews it crowds out later.

Any other key fails the launch.

The run reviews, then runs fix rounds until closure leaves nothing open: the
haiku fixer on findings tiered `haiku`, the Opus fixer on the rest, then a
closure verifier. The comment reviewer runs last.

## A stop

A stopped run returns `status: "stopped"`, `at` naming the stop, the items it
holds, and:

- `open`: the findings the next fixer takes up however the stop is answered,
  by id, title, path, line and tier;
- `removal`, when present: findings ruled skip whose tests still wait to come
  out;
- `stages`: every agent's report since the last answered stop;
- `carried`: the `deviations`, `choices` and `unsure` items the fixers
  declared, `preExisting` findings, which no fixer takes, `asides`, the
  reviewer's questions that change no code, and `escalations`, all since the
  last answered stop.

Answer every item the stop holds, under its id. `open` and `removal` take no
answer, and a key for one of their findings fails the run at its next stop.
Triage `carried` as an implementer's report is triaged, and do it before
relaunching: the relaunch starts `stages` and `carried` from empty, so what a
stop carries is read at that stop or never. A carried item the lead sends back
waits for the run's return, and goes out as its own change under the paragraph
on relaunching.

| `at` | Holds | Answer under each id |
| --- | --- | --- |
| `review` | `decisions`: the reviewer's decision findings; `questions`: its questions whose answer changes the code | a decision: `{ "action": "fix" }`, with an optional `instruction`, or `{ "action": "skip" }`; a question: text |
| `fix` | `questions` from the Opus fixer, each naming its finding, beside its `built` and `verification` | text |
| `contested` | `contested`: findings a fixer left unfixed because the fix would undo a ruling, each with the ruling and the reason | `{ "action": "fix", "instruction": "..." }`, the instruction settling the conflict, or `{ "action": "skip" }` |
| `closure` | `restructure`: fixes landing in one unit while the findings name mechanisms elsewhere, with where that unit is and the patch list; `undecided`: findings closure marked NEEDS-DECISION, with its reason; `decisions`: decision findings the closure opened | a restructure item: as a decision at `review`; ruled fix, it joins the next round at opus with the instruction if one is given, so the Opus fixer takes it and the next closure pass gives it a verdict, and ruled skip, it is dropped, with no test to take out; an undecided finding: `{ "action": "fix", "instruction": "..." }`, since a fixer has already edited for it, and reverting that edit and dropping its test is one instruction; an opened decision: as at `review` |
| `fixRounds` | `fixRounds`: the item the stop waits under; `round`, the rounds run so far | under that item's id: how many more rounds, a whole number; `0` ends the fixing, and the comment pass runs on the tree as it is |

`skip` drops the finding and takes its test out of the tree, and carries no
instruction. An answered question reaches every later fix brief and closure
launch. A restructure item the lead would re-plan rather than rule on is
answered by not relaunching.

## Relaunch

```
Workflow({
  name: "den:review-and-fix-workflow",
  args: { goal, plan, basis, rulings, reviewer, fixRounds, answers },
  resumeFromRunId: "<the runId the stopped return came with>",
})
```

The arguments repeat character for character, and `answers` keeps every
earlier stop's answers with this stop's added: the relaunch replays each
answered stop from cache, and a changed argument runs the agents after it
again live. A relaunch without `resumeFromRunId` runs every agent again, and
fails on the answers its new reports do not ask for.

A relaunch continues the run only while the tree is as the run left it at its
stop, with the answers the one thing added. A send-back or a hand edit since
the stop starts a fresh run instead, with no `resumeFromRunId`, on a tree whose
own change is committed first, so the review reads only what changed since.

## The return

`clean` means closure left nothing open and the comment pass ran. `capped`
follows a `0` at the round limit: the comment pass ran on the tree as it is,
and `open` and `removal` list what was left. Both carry `rounds`, and
`stages` and `carried` since the last answered stop, with the comment
reviewer's report last in `stages`; `carried` is triaged as an implementer's
report is. Each `escalations` entry is a finding the reviewer tiered `haiku`
that ran on Opus, with `reason` `question` when the haiku fixer asked about
it and `reopened` when closure reopened its haiku fix; it asks nothing, and
the triage reports it in a line. A run that throws is incomplete, not clean:
its message names the cause, and one that failed on an answer is relaunched
on its run id with the answers corrected.