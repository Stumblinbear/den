# The goal travels with the ask

Status: accepted 2026-09-14, with three changes to the workflow part: the
reviewer is given the goal, the restructure observation is its own item in
the closure report rather than a NEEDS-DECISION verdict, and the closure
verifier is shown the rounds before it. The workflow part lands in the
review-and-fix workflow's fix-loop step; the lead-skill text is drafted and
lands in the step that routes the lead through that workflow. The plan is
the review-and-fix plan of the same date.

## Context

The lead builds what it is asked and rarely asks what the ask is for. The
case that exposed it: a bug in `context-budget` where the cut-point reading
priced a `/rewind` cheaper than a `/compact`. The lead patched the skill's
prompt, the review found adjacent relay defects, the fixes for those opened
more, and five rounds in nobody had asked whether the prompt was doing too
much or whether the number being priced was read from the transcript at
all. It was not. The user found that by stopping the session and asking what
problem was being solved and why. The user has also asked, more than once,
to have their decisions questioned, and reports that it rarely happens.

The cause is in the text every session runs under, and it is general.

**The reason for a task is never an input to a stage; the ask always is.**
Across the lead skill, the agent definitions and the implement workflow, the
task's goal or purpose is consumed in two places: the design basis carried
into the brief and review (`plugins/den/skills/lead/SKILL.md:86`) and the
design-explorer's "serves the task's purpose"
(`plugins/den/agents/design-explorer.md:10`). The ask, as brief, scope, diff
range or findings, is consumed about ninety times over the same files. The
reviewer is handed the diff and nothing else, by design, so its read stays
fresh (`plugins/den/agents/reviewer.md:3`). The implementer is handed the
brief (`plugins/den/workflows/implement.js:140`). The closure verifier is
handed the findings, the basis and the scope
(`plugins/den/skills/lead/SKILL.md:203`). No agent in the loop can weigh the
reason, because none is given it, and the loop feeds each stage the previous
stage's output, so once a frame is set every later round works on that
frame's residue.

**The lead is told at three levels to take the ask as given, with no line
between questioning it and widening it.** The harness prompt says to act on
the actual request rather than what lies behind it and that the requested
scope is the deliverable. The lead skill says an instruction is taken at its
literal scope and a decision the user made is not raised again
(`plugins/den/skills/lead/SKILL.md:256-260`). The user's own corrections,
held as memory, say a stated direction is a decision to act on. Each is a
sound rule about what to build. None says that asking whether the ask serves
the goal builds nothing and so widens nothing, so under momentum the literal
rule wins, being repeated at every level, and the request to question, made
in prose, loses.

**Read off the shape rather than observed:** in a long session the goal is
one sentence near the top and the solution is everything since, and a model
attends where the tokens are. A rule to remember the goal is one line
against a hundred thousand of the solution, so the goal has to be
re-injected at each stage by the data flow, not remembered by a rule.

A first attempt at this went one layer too low and was reverted before
release. It added a required `mechanism` field to the reviewer's finding and
aimed the fix contract at it. That hardens the reviewer-to-fixer loop, which
was never observed to fail, and leaves the lead's loop as it was. It is not
to be reintroduced on this ground; if a reviewer-level failure is observed
later it gets its own case.

## Proposal

Two moves, and both change what flows rather than adding a ritual.

**The goal is data wherever the ask is data.** The goal, in the user's terms
and not the ask restated, stands beside the task at the top of the plan, the
brief and every fix brief, and each stage is read against it: a brief for
whether it reaches the goal, a fix for whether what it removes stood in the
way, a closure for whether the goal is met and not only the finding closed.
A goal that can only be written as the ask restated is one question to the
user before anything is built. A fix ask arrives already past its diagnosis,
so it names the symptom it is for, and the symptom is what `den:diagnosing`
takes; that conversion is what the cut-point case lacked.

**The rules draw the boundary.** Beside the literal-scope rule: what the ask
assumes, and what it is one way of reaching, is said in the same turn when
it is not plain, since asking builds nothing and widens nothing. A decision
the user made is reopened on an observation they did not have when they
made it, and on nothing else.

**Momentum has a stop with a shape.** A fix round is read against the goal
and the rounds before it. Fixes landing in one unit while the findings name
mechanisms elsewhere say the unit is compensating for something upstream,
and that is a restructure question to the user with the patch list, not
another round. Round count is not the signal: agents routinely need four or
five rounds to cover every scenario, and a stop on count would fire on every
honest step.

The lead-skill text for all three is drafted: a new section "The goal
travels with the ask" after "Claims about code", the boundary sentences in
"Talking to the user", the stop appended to "Fixes", "intended outcome" at
line 113 renamed to "goal" so the concept has one word, and the closure
launch at line 203 carrying the goal. The closure-verifier definition gains
the goal in its launch prompt and judges the round against it.

## For the fix loop in the review-and-fix workflow

The workflow was recut the day this was accepted: the implementer runs
through the Agent tool and the workflow starts at the review, so it runs
the review, the fix rounds, the closure passes and the comment pass with
the lead asleep. That makes the workflow the one place the goal slot is
enforced rather than advised, and the closure verifier the only reader
that can see a round patching around the goal, so the fix loop is built
with both from the start.

- `goal` is a required input beside `basis`, validated in the same style:
  nonempty text, and named in the "and nothing else" list. The launch fails
  without it, which is the point. The implementer's goal slot is the lead's
  brief on the Agent tool route, which the lead-skill text covers.
- The review scope carries the goal beside the range and the plan. A
  one-line goal in the user's terms is not a description of the change, so
  it hands the reviewer none of the launcher's conclusions, and a reviewer
  that holds it can find that the change does not reach it, which is the
  finding no agent in the loop above could make. When no plan is given the
  goal is the only frame the reviewer has.
- Every fix brief opens with the goal and carries each finding as the
  reviewer worded it, its evidence, its repair and the lead's ruling under
  the finding's id. A fixer given the repair alone can only apply it.
- Every closure launch opens with the goal and carries the open findings,
  one record per earlier round with its findings and their verdicts, the
  basis, the plan and the settled decisions. The verifier judges the round
  against the goal and not only the finding closed.
- The restructure observation is its own item in the closure report, not a
  NEEDS-DECISION verdict, since a verdict is on one finding and answered
  under that finding's id while this observation is on the round and has no
  finding to hang from. The verifier is the agent that can see fixes
  clustering in one unit while the findings name mechanisms elsewhere, and
  only when it is shown the rounds before, since a cluster across rounds is
  invisible in one. It reports the item with the units, the mechanisms and
  the patch list; the workflow stops on it as it stops on a decision
  finding, and the lead's answer under the item's id is the instruction the
  next round runs under. A run the lead re-plans or diagnoses instead is
  simply not relaunched.

Rejected: detecting the patch cluster in the workflow itself by comparing
the fixer's touched files against the findings' paths across rounds. It is
a heuristic on paths, it fires on the honest case where a guard and the
scenario it misses sit in one function, and it duplicates a judgement the
closure verifier already makes with the code in front of it. Rejected too:
the reviewer blind to the goal, reading the change against the plan alone,
which leaves a run without a plan reviewing against nothing.

## Considered options

- **A frame block the lead writes at the ask and at each fix round**, as a
  checkpoint ritual. Rejected as the primary mechanism: a rule to remember
  competes in the same over-full budget as the rules that lose the goal
  today. The same lines survive as the slot the data flow requires.
- **A stop before any second fix round.** Rejected by the user: rounds are
  the normal unit of an agent covering scenarios it missed, and a stop on
  count teaches the user to wave it through.
- **A single "premise" line beside the goal.** Rejected: a lead that already
  holds a story writes that story's premise and its observation, and the
  line passes while the real premise goes unchecked. The differential lives
  in `den:diagnosing`, where several mechanisms are listed with what
  discriminates each, and the symptom routes there through the conversion
  above.

## Consequences

Every plan, brief, fix brief and closure launch carries one more line, and
the user reads it. A workflow launch without a goal fails. A lead that
cannot write the goal except as the ask restated stops and asks, one
exchange, before building. A restructure question reaches the user with the
patch list as evidence instead of a sixth round.

Every change's review now runs through the workflow, so a quick change made
in the session without a plan or brief meets the goal slot at the launch.
Nothing forces the goal line to be written truthfully; what changes is that
the omission has to become a written line in front of the user, which is a
different failure from the silent one.

The lead skill is about 280 lines and these edits add about fourteen. A
removal-test pass over the whole skill is the change that would give the new
rule room, and it is proposed separately once this has been seen to work.
