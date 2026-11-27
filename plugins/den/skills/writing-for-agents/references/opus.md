# Opus

How Opus models respond to instruction text.

## Opus 5.5

- **Effort, not the text, sets how much it thinks.** Opus 5.5 always thinks,
  and an agent definition's `effort` field sets how much. Delete a "think
  carefully" or "don't overthink" line: lowering effort cuts thinking more
  reliably than asking for less. Effort names don't mean the same thing
  across models: Opus 5.5 at `medium` matches Opus 5 at `high`.
- **It already says too little.** Delete rules against narrating, such as
  "hold findings for the final response", rather than tuning them. If you
  want updates, say when: a line about what it is about to do before the
  first tool call, and a recap at the end.
- **Early stops in unattended runs.** With no one to answer, it can end its
  turn on a report that announces the next step instead of taking it, an
  offer to carry on, or a list of decisions none of which block the work. For
  a subagent, ending its turn is returning to its caller. Calling these stops
  unwanted steers it, as long as the text also says which stop is wanted: the
  one where nothing can move without the caller. The caller treats a
  subagent's return as a report, not as proof the task is done.
- **It runs text written for Opus 5 well.** Anthropic's guidance for Opus 5.5
  says the verification and conciseness rules below may no longer be needed,
  and neither may rules limiting a change's scope, so test those for removal
  first.

## Opus 5

- **Remove "verify your work" and "double-check" instructions.** Opus 5
  checks its own work already, so they cause extra checking with no gain in
  quality.
- **Ask for every finding, and filter in a separate pass.** In a review
  prompt, a severity filter such as "only report high-severity issues" is
  followed literally and causes under-reporting.
- **Ask for conciseness explicitly,** and in a long prompt repeat the request
  near the end.
