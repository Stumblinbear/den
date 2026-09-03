---
name: comment-review
description: Launch the comment-reviewer on the pending diff, with the diff already in its first message when it fits inline. Invoke only with the user's explicit per-pass authorization, after functional churn has settled. Takes an optional git diff range as argument; default is the working tree against HEAD.
argument-hint: "[diff range, default HEAD]"
context: fork
agent: den:comment-reviewer
---

Scope: the change rendered below.

!`bash "${CLAUDE_PLUGIN_ROOT}/scripts/diff-scope.sh" $ARGUMENTS`
