---
name: comment-review
description: Launch the comment-reviewer on the pending diff with the diff already in its first message. Invoke only with the user's explicit per-pass authorization, after functional churn has settled. Takes an optional git diff range as argument; default is the working tree against HEAD.
argument-hint: "[diff range, default HEAD]"
context: fork
agent: den:comment-reviewer
---

Scope: the diff below, taken from the repository at `!`git rev-parse --show-toplevel`` against `${ARGUMENTS:-HEAD}`. Untracked files are not in it; the status listing names any.

```
!`git status --short`
```

```diff
!`git diff ${ARGUMENTS:-HEAD}`
```
