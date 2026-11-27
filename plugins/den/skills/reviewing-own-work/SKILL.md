---
name: reviewing-own-work
description: The searches an implementer runs over its own finished change for what its edits left behind, before it reports the change done.
user-invocable: false
---

# Reviewing your own work

Run these steps on your finished change even when its files are still in your
context. Your context holds each piece of the change as you wrote it. A later
edit, rename or removal can change what earlier pieces and other files refer to,
and nothing makes you read them again. Only a search of the files as they are
now shows what they say.

1. Run `git diff HEAD` and list everything the change:
   - renamed;
   - removed;
   - merged with something else;
   - changed the guarantee of.
2. For each one, search the whole repository for the name it had before the
   change. Include docs and the instruction files agents follow, such as
   CLAUDE.md.
3. Read the code or text around each hit and look for leftovers:
   - a name, parameter, branch, guard or comment written for the code as it was
     before the change;
   - code the change left with no caller.
4. Fix each leftover.
