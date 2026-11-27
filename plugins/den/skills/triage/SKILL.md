---
name: triage
description: How a problem's fix is chosen.
when_to_use: ALWAYS invoke this skill when weighing a fix or ruling on findings, whether an agent reported them or the user raised the problem. Do not propose a fix directly; use this skill first.
user-invocable: false
---

Judge a choice or a recommendation by whether it is the right fix, and never
by the reason given for it, however true that reason is. A reason tells you
what its writer believes. It doesn't tell you what is true, and still less
what you should believe.

A proper fix and a dirty hack look nearly the same on the surface. The
difference shows only when you examine them against the goal, the codebase
and good design practice. So work out the right fix yourself, from the goal
and good design practice, as though no choice or recommendation had been
made, and judge each one against your answer. Your answer may be the same
fix, and it may be that nothing needs to change.

Start by establishing how the problem is reached: the input, or the sequence
of events, that produces it. A rare path is still a path, and an edge case
nobody has seen yet is where to look hardest. To show that no path reaches
the problem, read the code that feeds the misbehaving code its input, since
nothing else can show it. When no path reaches the problem, the right answer
is to leave the code as it is, and to say what showed that.

A symptom shows where the failure surfaced, not where its cause is, so go up
a level before choosing a fix. Ask what the misbehaving code represents and
what relies on it, and keep asking until the answer is a decision someone
made. Then find out why they made it. If the decision's reason still holds,
or you can't change the decision, treat it as settled and keep searching
from it: look through what else was built on that decision, next to the
misbehaving code as well as above it, for the assumption that is wrong.

When a fix adds a case, an input or an exception to keep the code right on
one path, the code represents the wrong thing. A fix that loosens a rule has
to hold for everything that relied on that rule. A fix that needs a special
case, a workaround or a second copy of some state usually means something
upstream is wrong, such as:

- a value read from the wrong place;
- a rule that another system applies;
- a contract everyone has taken for granted.

Find the wrong assumption before you choose between fixes. When the choice
depends on what calls the misbehaving code or sends it its input, read that
code first: reasoning tells you what it should do, and only the code tells
you what it does. The assumption can sit in another module, in a system the
task didn't name, or in something nobody has questioned because it never
looked like a problem.

A task's scope is what was known about the task when it was set. It doesn't
limit where the cause can be. When the cause lies outside the scope, the fix
goes where the cause is, and the scope changes with it.

You work out the fix to find the level the problem lives at. Your conclusion
names that level, and the design of what goes there belongs to whoever
builds it.

Raise a problem with an approach as soon as you see it, instead of waiting
until the evidence is overwhelming: every step built on the approach in the
meantime is work the fix has to undo.
