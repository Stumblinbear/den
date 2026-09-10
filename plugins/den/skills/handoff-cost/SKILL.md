---
name: handoff-cost
description: A reading of the current context for handing coupled implementation off, pricing a fork of this session, a model switch and a brief to a standing implementer as cache-miss token counts, and the question that puts the choice to the user.
when_to_use: ALWAYS invoke this skill when implementation is about to start under the coordination rules and the design is pinned, before proposing a launch, a fork or a model switch. Do not quote a context size or choose the handoff yourself; use this skill first.
argument-hint: "[model for the switch row; default opus]"
user-invocable: false
allowed-tools: AskUserQuestion
---

# Handing implementation off

The design is pinned and the context that pinned it is the one worth keeping. Three ways to carry it, priced on the context as it stands now:

!`node "${CLAUDE_PLUGIN_ROOT}/lib/shared/launch.mjs" --data "${CLAUDE_PLUGIN_DATA}" scripts/handoff-cost --session "${CLAUDE_SESSION_ID}" --target "$ARGUMENTS"`

## Asking

Put the three to the user with AskUserQuestion, one question, header `Handoff`, `multiSelect` false, the options labelled exactly `Fork`, `Switch model` and `Brief an implementer`, in that order. Each description carries that row's figure from the reading and one clause of what it keeps: a fork keeps this context and this model, and works out of view; a switch keeps this context on the model the user names and implements in this session; a brief carries none of it. The header and labels are what the switch hook matches, so they are not reworded.

The reading is the facts and the choice is the user's: no option is marked recommended, none is ranked, and no description is worded to steer. The user weighs the figures against an allowance this session cannot see.

## Acting on the answer

- `Fork`: launch a fork (`subagent_type: "fork"`, in the background) with the instruction and nothing more, since it holds everything this session holds: the pinned design, its reasons and the scope fence are already in its context, and a re-typed brief would be the lossy handoff the fork exists to avoid. The instruction says one more thing, because the fork reads the same harness prompt as this session and that prompt says to finish the task: for the fork, a decision that is the user's (a workaround, a test weakened or deleted, a stored format, a public surface, a dependency, behaviour the user can see, a fence in the way, a pin the code contradicts) ends the fork's turn with only the question, and it is resumed with the answer; a task finished on such a decision is a failure however green. Ask it to report routine choices, questions it stopped on and anything left undone, so its report is triaged as an implementer's.
- `Switch model`: tell the user to run `/model <target>` and then send any prompt, and stop. The switch itself is the go: den's hook reads the standing answer off the transcript at the moment of the switch and says so, and what it says reaches this session with the next prompt, on the new model, which then implements inline under the pinned design. A prompt typed before the switch overtakes the answer, and the hook stays silent; so does a switch the user did not make, a resume restoring the model or an automatic one. A switch the user made while the answer stands is the go, whatever invoked it. Where the reading says the session is already on the target, there is no switch to wait for: the answer means implement inline now.
- `Brief an implementer`: the coordination rules' brief path, unchanged.
