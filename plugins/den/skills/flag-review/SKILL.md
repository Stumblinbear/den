---
name: flag-review
description: Launch the flag-reviewer (fable, flag-only code and architecture review) on the pending diff with the diff already in its first message. Invoke only with the user's explicit per-launch authorization. Takes an optional git diff range as argument; default is the working tree against HEAD.
argument-hint: "[diff range, default HEAD]"
context: fork
agent: den:flag-reviewer
---

Scope: the diff below, taken from the repository at `!`git rev-parse --show-toplevel`` against `${ARGUMENTS:-HEAD}`. Untracked files are not in it; the status listing names any.

```
!`git status --short`
```

```diff
!`git diff ${ARGUMENTS:-HEAD}`
```
