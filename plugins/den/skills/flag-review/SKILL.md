---
name: flag-review
description: Launch the flag-reviewer (fable, flag-only code and architecture review) on the pending diff, with the diff already in its first message when it fits inline. The argument is a git diff range and nothing else (revisions, optionally `-- paths`), never a description of the scope; omit it to review the working tree against HEAD.
argument-hint: "[git diff range only, e.g. HEAD~1 or main..HEAD; omit for the working tree]"
context: fork
agent: den:flag-reviewer
---

Scope: the change rendered below.

!`bash "${CLAUDE_PLUGIN_ROOT}/scripts/diff-scope.sh" "$ARGUMENTS"`
