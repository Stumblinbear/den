---
name: review
description: Launch the reviewer on the pending diff, with the diff already in its first message when it fits inline. The argument is a git diff range and nothing else (revisions, optionally `-- paths`), never a description of the scope, optionally followed by `--plan <path>` naming the plan or brief the change was written to; omit the range to review the working tree against HEAD.
argument-hint: "[git diff range, e.g. HEAD~1 or main..HEAD; omit for the working tree] [--plan <path>]"
context: fork
agent: den:reviewer
user-invocable: false
---

Scope: the change rendered below.

!`bash "${CLAUDE_PLUGIN_ROOT}/scripts/review-scope.sh" "$ARGUMENTS"`
