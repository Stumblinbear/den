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
  args: { repo, goal, plan, rulings, reviewer, fixRounds: 3 },
})
```

| Argument | Value |
| --- | --- |
| `repo` | Required. The absolute path of the repository whose working tree is reviewed. Every agent the run launches works there, whatever directory the session stands in. |
| `goal` | Required. What the change is for, in the user's terms: the plan's `Goal:` line, quoted. It opens the review and every fix and closure launch. |
| `plan` | The plan's path, when the change is a step of one. |
| `rulings` | A list of the decisions settled on the implementer's report that a fix could undo, one decision with its reason per item, each at most 400 characters. Every fix brief and closure launch carries the list numbered, and a fixer sorts its findings against it before any edit: it leaves unfixed a finding whose fix would undo a decision, names the decision by its number, and the run stops on that finding. |
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
closure verifier. The comment reviewer runs last over the tree.

## A stop

A stopped run returns `status: "stopped"`, `at` naming the stop, the items it
holds, and:

- `rounds`: the run round by round, oldest first, one record per round,
  judged or not: a round with nothing left open once its fixers ran, one whose
  findings were all contested or one that only took tests out, has `findings`
  empty. Each carries `findings`, what the round worked, with the `verdict`
  each ended in and the verifier's `reason` for it, which is the account of
  what was built; `fixes`, the figures each of the round's fixers verified the
  tree with, by tier; and `removed`, the skipped findings whose tests that
  round took out. A round is recorded when it ends, so a stop inside a round
  carries the rounds before it, and a `fix` or `contested` stop carries the
  round's `fixes` so far beside its items, each with what its fixer `built` in
  its own words, since the lead answers that fixer's question from it. The
  agents' own reports stay in the journal;
- `open`: the findings the next fixer takes up however the stop is answered,
  each under its `id`, `title`, `path`, `kind` and `tier`, and whole where a
  question the stop holds names it;
- `removal`, when present: findings ruled skip whose tests still wait to come
  out, narrowed as `open` is;
- `carried`: the `deviations`, `choices` (each what the fixer `chose` and what
  it was chosen `over`) and `unsure` items the fixers declared, `preExisting`
  findings, which no fixer takes, and `asides`, each under the `stage` that
  filed it: the reviewer's questions that change no code, a fixer's question
  or contested item about a finding its brief did not carry, and a haiku
  fixer's question about the work as a whole, since that tier's questions
  never wake the lead. All since the last answered stop.

Answer every item the stop holds, under its id. `open` and `removal` take no
answer, and a key for one of their findings fails the run at its next stop.
Triage `carried` as an implementer's report is triaged, and do it before
relaunching: the relaunch starts `carried` from empty, so what a stop carries
is read at that stop or never. A carried item the lead sends back waits for the
run's return, and goes out as its own change under the paragraph on
relaunching.

| `at` | Holds | Answer under each id |
| --- | --- | --- |
| `review` | `decisions`: the reviewer's decision findings; `questions`: its questions whose answer changes the code | a decision: `{ "action": "fix" }`, with an optional `instruction`, or `{ "action": "skip" }`; a question: text |
| `fix` | `questions` from the Opus fixer, each naming the finding it is about, or naming none where it is about the work as a whole; `fixes`: what the round's fixers built and verified so far | text |
| `contested` | `contested`: findings a fixer left unfixed because the fix would undo a ruling, each with the ruling's number and the reason; `fixes` as at `fix` | `{ "action": "fix", "instruction": "..." }`, the instruction settling the conflict, or `{ "action": "skip" }` |
| `closure` | `restructure`: fixes landing in one unit while the findings name mechanisms elsewhere, with where that unit is and the patch list; `undecided`: findings closure marked NEEDS-DECISION, with its reason; `decisions`: decision findings the closure opened | a restructure item: as a decision at `review`; ruled fix, it joins the next round at opus with the instruction if one is given, so the Opus fixer takes it and the next closure pass gives it a verdict, and ruled skip, it is dropped, with no test to take out; an undecided finding: `{ "action": "fix", "instruction": "..." }`, since a fixer has already edited for it, and reverting that edit and dropping its test is one instruction; an opened decision: as at `review` |
| `fixRounds` | `fixRounds`: the item the stop waits under; `round`, the rounds run so far | under that item's id: how many more rounds, a whole number; `0` ends the fixing, and the comment pass runs on the tree as it is |

`fix` asks for a change to the tree, and its `instruction` says which. `skip`
leaves the tree as it stands, so it carries no instruction, and what the
reviewer added for the finding leaves with it. An answered question reaches
every later fix brief and closure launch. A restructure item the lead would
re-plan rather than rule on is answered by not relaunching.

## Relaunch

```
Workflow({
  name: "den:review-and-fix-workflow",
  args: { repo, goal, plan, rulings, reviewer, fixRounds, answers },
  resumeFromRunId: "<the runId the stopped return came with>",
})
```

The arguments repeat character for character, the `rulings` list item for
item, and `answers` keeps every earlier stop's answers with this stop's added:
the relaunch replays each answered stop from cache, and a changed argument
runs the agents after it again live. A relaunch without `resumeFromRunId` runs
every agent again, and fails on the answers its new reports do not ask for.

A hand edit or a send-back since the stop joins the relaunch: the fixers and
the closure verifier read the tree as it stands, and a finding the edit
already met closes at the next pass. A fresh run, without `resumeFromRunId`,
is for a tree whose change the review never read, on a tree whose own change
is committed first, so the review reads only what changed since.

## The return

`clean` means closure left nothing open and the comment pass ran. `capped`
follows a `0` at the round limit: the comment pass ran on the tree as it is,
and `open` and `removal` list what was left, each finding whole, since the
user decides one by one what becomes of the test left in the tree for it. Both
carry `rounds` for the run as a whole, `comment`, the comment pass's `counts`
and its `gaps`, each a comment kept although the code in scope cannot show its
claim, and `carried` since the last answered stop, triaged as an implementer's
report is. The figures a round's `fixes` carry are from before the comment
pass, which edits comments and runs no tests. A run that throws is incomplete,
not clean: its message names the cause, and one that failed on an answer is
relaunched on its run id with the answers corrected.
