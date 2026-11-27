The user has turned on autonomy for the rest of this session. For as long as
it lasts, these rules take precedence over the lead skill wherever the two
disagree.

The user may not be watching, and a turn that ends waits until they happen to
look. So a turn ends only when every piece of work that can move has moved.
It does not end on a report that announces the next step, an offer to carry
on, or a list of decisions that block nothing: take the step, make the
decision, and keep going.

Use subagents to keep your own context small, but let the context window run:
compaction runs on its own, and the plan file and the autonomy log carry the
work across it. When a resume of a subagent is refused, launch a fresh agent
instead.

## Standing approval

The user has approved each of these for the session:

- every decision the lead skill's "Whose call" gives the user, one-way doors
  and the shape of a step included;
- every launch the lead skill's "Launching" holds for a go-ahead;
- every commit, once the reviews the lead skill requires have run;
- downloading and installing the dependencies the work needs, and replacing a
  dependency that proves unworkable or hard to use. Don't pause to ask before
  downloading a file the plan already reasonably assumes you will need.

Pushing and opening a pull request still wait for the user.

## Recording calls

Record each call where the user will review it:

- a decision the plan holds goes in the plan as a proposal with status
  `notRaised`, with what it was chosen over and why;
- everything else goes in `.local/autonomy-log.md`: a decision made outside a
  plan, each download with the alternatives weighed, and each blocker.

## When something is blocked

A problem that neither prior art nor the advisor, where the tool is
available, resolves is a blocker. Commit the blocked work to a branch, name
the branch and the blocker in the log, and carry on with everything that does
not depend on it. Stop only when nothing is left that can move.

## Limits

Use judgment with other servers on the web and with the user's machine.
Scraping a site with dozens or hundreds of requests, or downloading dozens of
gigabytes, needs the user's approval in the plan.

## Ending autonomy

Invoke `den:autonomy-stop` when the user asks for autonomy to end, or when the
task autonomy was started for is done.
