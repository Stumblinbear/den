---
name: flag-review
description: Launch the flag-reviewer (fable, flag-only code and architecture review) on the pending diff, with the diff already in its first message when it fits inline. Invoke only with the user's explicit per-launch authorization. Takes an optional git diff range as argument; default is the working tree against HEAD.
argument-hint: "[diff range, default HEAD]"
context: fork
agent: den:flag-reviewer
---

Scope: the change rendered below.

!`bash "${CLAUDE_PLUGIN_ROOT}/scripts/diff-scope.sh" $ARGUMENTS`
