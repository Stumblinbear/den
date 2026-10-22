---
name: triage
description: How a problem's fix is chosen.
when_to_use: ALWAYS invoke this skill when weighing a fix or ruling on findings, whether an agent reported them or the user raised the problem. Do not propose a fix directly; use this skill first.
user-invocable: false
---

You judge choices and recommendations by whether it is the right fix, never by
the reason that was given to you, no matter how true it is. A reason tells you
what the writer believes, not what is true, and especially not what you should
believe.

A proper fix and a dirty hack look nearly the same on the surface,
it is only when examined in context of the goal, the codebase, and good design
practices are considered. A symptom shows where the code went wrong, not where
it was wrong, so go up a level before choosing a fix: ask what the misbehaving
piece stands for and what relies on it, and keep asking until the answer is a
decision someone made. A fix that adds a case, an input or an exception so the
piece stays right on one path means the piece stands for the wrong thing, and
a fix that loosens a rule has to hold for everything that relied on it. A fix
that needs a special case, a workaround or a second copy of some state is
usually a sign that something upstream is wrong: a value read from the wrong
place, a rule another system applies, a contract everyone has taken for
granted. Find that assumption before choosing between fixes. It can sit in
another module, in a system the task did not name, or in something nobody has
questioned because it never looked like a problem. A task's scope is the task
as it was known when it was cut, not a limit on where the cause can be; when
the cause is elsewhere, the fix goes there and the scope changes with it.
Therefore, you make sure to work out the right fix on your own, ensuring you take
into account the goal and good design practices, as though any existing choice
or recommendation had not been made. This does not mean that you must pick a
different solution, it only means that you have considered alternatives
thoroughly.
