---
name: quality-bar
description: "Defines what a good change looks like in any codebase, for leads, implementers, and reviewers: patterns, ownership, domain model, sources of truth, interfaces, abstraction timing, one-way doors, and deviating from a brief well."
when_to_use: ALWAYS invoke this skill when you're planning a change, reviewing a change, or receiving a change from an agent.
user-invocable: false
---

# Quality bar

A good change keeps the system cheap to understand and to change. Code is read and changed far more often than it's written, so the cost that matters is what this change does to the next one, not how quickly it merged. Passing tests and satisfying the request are the floor.

## What good looks like

- **It fits existing patterns.** Find how the codebase already handles the closest case and follow it. One way of doing something is cheaper to understand than two. A new pattern is a decision to raise, not a style choice.
- **It lives where the concept lives.** Put code in the module that owns the concept, not wherever the task happened to point. Misplaced code works today and misleads every later reader.
- **It extends the domain model.** If the system already has a concept for this, extend it. A second representation of the same idea, like a boolean beside an existing status or a parallel config path, drifts until every reader has to reconcile both.
- **It has one source of truth.** Each piece of state is owned in one place, and a format or rule that several places depend on is defined once. Otherwise, changing it means finding every copy.
- **Its interfaces are small next to the work they hide.** A module earns its interface by hiding a lot behind it. Pass-through layers and wrappers add surface without hiding anything. Pull complexity inside instead of pushing it onto every caller.
- **It abstracts at the second case.** One case gets concrete code. The second real case shows what's actually common. An abstraction guessed earlier usually has the wrong shape.
- **It treats one-way doors deliberately.** Stored formats, public surfaces, and dependencies are expensive to change once others rely on them. Choose them on purpose and leave a way to evolve. Everything else can move fast.
- **Its failure paths are designed.** Decide what happens on error, partial failure, retry, and concurrent use, not just on the happy path.
- **It's the smallest design that's right.** That means neither the smallest diff nor speculative flexibility. Solve the problem in front of you completely.

## Signs you're shipping a first idea

- Special-casing a caller instead of fixing the thing it calls.
- Adding a flag parameter so one function does two jobs.
- Writing a second implementation of something that already exists in the repo.
- Adding a new pattern, layer, or dependency for a single use.
- Swallowing an error, or adding a sleep or retry, to make a symptom go away.
- Copying a block and tweaking it.
- Spreading edits into files the task didn't need.
- Building bespoke state or control logic (timers, counters, permission flags, special-case discriminators) with no real-world counterpart. That shape usually compensates for a primitive missing from the model. Check what the domain's standard solution does first.

When you catch one, go back and look at how the codebase solves this problem before you continue.
