---
name: reviewing-own-work
description: The searches an implementer runs over its own finished change for what its edits left behind, before it reports the change done.
user-invocable: false
---

# Reviewing your own work

Run this search over the finished change even where its files are still in
your context. What you hold is each piece as you wrote it, and a later edit,
rename or removal changes what the rest of the tree says without passing back
through what you read; a search of the tree as it stands is what shows it.

From `git diff HEAD`, list what the change renamed, removed, merged or changed
the guarantee of. For each, search the old term across the repository, its
docs and instruction files included, and read what stands beside each hit: a
name, parameter, branch, guard or comment written for the old shape, and code
the change left with no caller. Fix what it finds.
