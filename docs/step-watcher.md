# A watcher that asks an implementer whether its step has grown

Status: proposed, 2026-09-10. Held back until a step outgrowing its plan is
seen in practice with the steps rule in place; the rule alone may be enough.

## Context

den is moving to stepwise delivery: a feature lands as a sequence of steps,
each small enough for the user to read in one sitting, each reviewed and
committed before the next is briefed. The rule that a step is one read lives
in the lead skill. Nothing enforces it while an implementer is working, and
the failure it guards against is discovered only when the step lands: a fork
or a briefed implementer keeps going, the diff reaches thousands of lines,
and the user's review is the first place anyone notices.

The published evidence on change size says review effectiveness falls faster
than linearly as a change grows, and that the governing bound is the
reviewer's attention rather than a line count. A line count is what a hook
can measure. Whether a change is still the step it was briefed as is a
judgment.

## Proposal

We would add a hook that runs after edits inside an implementing agent, paced
to fire every so many edits rather than on each one, and hands a small model
the brief and a summary of the current diff with one question: is this work
growing past what the brief asks? On a yes, the hook injects the judge's
reason as additional context, and the implementer is required to check its
diff against the plan and to stop and report if the work is beyond it, rather
than finish. The judge's sentence is what makes the injection a question the
agent must answer and not an order it obeys.

The brief is read from the agent's own transcript: the first instruction for
a briefed implementer, the launch instruction for a fork. A plan kept as a
file beside the code would give the judge something better to read against.

The cadence is a setting in the plugin's config, so the cost of the checks is
a number the user can see and change.

## Considered options

- **A line-count alarm.** A number in config; a hook that says so when a
  step's diff crosses it. Cheap and deterministic. Cannot tell a rename across
  forty files from a feature that sprawled, so it fires on the wrong steps and
  stays silent on a small diff that has drifted off its brief.
- **A judge that reads the brief** (this proposal). Fires on drift rather
  than size, so fewer false positives. Costs a model call per check and
  depends on the brief being readable from the transcript.
- **Nothing beyond the rule.** The lead cuts steps before briefing and the
  implementers stop on the conditions their definitions already name. Free.
  Catches the overgrown step only when it lands.

The third option is the one in force. This record exists so that, when the
rule proves insufficient, the judge is built rather than the alarm.

## Consequences

- A model call per check, on the cadence set in config, for every
  implementing agent.
- The context-budget plugin already runs a paced judge with a gate read
  cheapest first; the same shape and much of the same code would serve here.
- An implementer interrupted with a question it answers wrongly, by
  stopping when it should have finished, costs a resume; one that ignores the
  question is the instruction-following failure the injected reason is
  meant to prevent, and would be the signal to move the check into a harder
  gate.
