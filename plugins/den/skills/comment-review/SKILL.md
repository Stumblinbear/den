---
name: comment-review
description: Launch the comment-reviewer on the pending diff, with the diff already in its first message when it fits inline. Invoke only with the user's explicit per-pass authorization, after functional churn has settled. The argument is a git diff range and nothing else (revisions, optionally `-- paths`), never a description of the scope; omit it to review the working tree against HEAD.
argument-hint: "[git diff range only, e.g. HEAD~1 or main..HEAD; omit for the working tree]"
context: fork
agent: den:comment-reviewer
---

Scope: the change rendered below.

!`bash "${CLAUDE_PLUGIN_ROOT}/scripts/diff-scope.sh" "$ARGUMENTS"`
