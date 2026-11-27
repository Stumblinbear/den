# Fable

How Fable models respond to instruction text.

## Fable 5 and later

A short instruction steers as well as one that lists each behavior by name.
Instructions tuned for earlier models are often too detailed, and make the
output worse.

## Fable 5.2

Fable 5.2 follows each instruction exactly as written, so tuning text for it
is mostly deleting lines.

- **Effort, not the text, sets how much it thinks.** At `medium` and above,
  a line asking it to think less changes nothing. Start at `high`. `low`
  works for well-specified work. Keep a level above `high` only if you
  measured a gain. When a level was tuned on another model, test it again.
  Effort barely changes how long a reply is; the text decides that.
- **Early stops.** On long work, and more often at `low` and `medium`, it can
  end its turn on a list of what is left, an offer to continue, or an
  ordinary obstacle. Text that steers it tells two kinds of obstacle apart.
  An error, a timeout, an empty result or a failing tool is diagnosed and
  worked through. A blocker someone chose, such as a file marked off-limits
  or access withheld, is left alone and reported.
- **An approval rule lists the exact actions it covers.** A broad rule gets
  applied to routine work too: a rule about messages to people outside the
  conversation held back about half of ordinary requests to colleagues.
- **Write an exception into the rule it lifts.** Given as a separate line,
  the exception got the step taken about one time in ten; written into the
  rule, about nine in ten. Listing the steps that need no approval works,
  while a general line telling it to act more freely changes nothing.
- **Cautions build up** anywhere context carries over: memory, notes,
  instruction files, and a reviewer's conditions passed to the next agent.
  Delete a caution once its reason no longer holds, and give an absolute
  rule its scope and its reason.
- **How the text describes ownership decides how it changes code.** If the
  text doesn't say who owns the code, or says it is someone else's, the model
  adds new code beside the existing structure and reports problems it sees
  nearby. If the text says the codebase is the agent's own, it merges
  repeated code and fixes related problems. That makes about one and a half
  times as much change, including changes nobody asked for. A scope rule
  elsewhere doesn't cancel this, and its closing summary leaves out the small
  changes, so read the diff.
- **It delegates as the text tells it to.** It readily follows a standing
  instruction to delegate. A description of anything that starts a subagent
  states what a subagent costs first, then when one is worth it and how to
  brief it.
- **A strict style limit makes its writing choppy,** so keep a limit only if
  something enforces it.
- **A token budget written into the prompt changes how much it spends,** so
  leave one out unless a test shows it helps.
- **Updates and reports.** It writes little between tool calls. When a person
  is watching, the text asks for a line before the first tool call, short
  updates, and a closing recap that makes sense on its own. A final report is
  written for a reader who saw none of the work: the main points first, in
  full sentences, with no term coined during the run.
