---
name: diff-page
description: Renders a git diff range as one page file, a collapsible section per file with old and new line numbers and coloured lines, prose files word by word and code by syntax where difftastic is installed, and sends the file to the user for reading away from the terminal. The argument is a git diff range with optional `git diff` options and nothing else (revisions, options such as `-W`, optionally `-- paths`); omit the range for the working tree against HEAD.
when_to_use: ALWAYS invoke this skill when the user asks to see, read or review a diff from a phone or another device, or asks for a change as a page. Do not paste the diff or publish it as an artifact directly; use this skill first.
argument-hint: "[git diff range and options, e.g. HEAD~1, main..HEAD or -W HEAD; omit the range for the working tree]"
allowed-tools: SendUserFile
---

# A diff as a page

!`node "${CLAUDE_PLUGIN_ROOT}/lib/shared/launch.mjs" --data "${CLAUDE_PLUGIN_DATA}" scripts/diff-page "$ARGUMENTS"`

The line above is what the diff-page script printed. When it names a file, send
that file with SendUserFile, with `display` set to `render`, `status` set to
`normal`, and a one-line caption giving the range and the counts from that line.
The file is what this skill delivers, so publish it as an artifact only when the
user asks for a link. When the line says instead that the diff is empty, or why
no page was rendered, give the user that line as it stands.

The page ignores changes to whitespace, as `git diff -w` does. When the argument
carries one of git's whitespace options, that option replaces the default. To
show whitespace changes, pass `--ignore-cr-at-eol`, which replaces the default
and hides only a carriage return at the end of a line.

Write an option's value in the same word as the option, as in `-U5` or
`--diff-filter=M`. Before `--`, a word that doesn't start with `-` is read as a
revision, so the `5` in `-U 5` would be taken for one. Write a pathspec as git
takes it, such as `:(exclude)docs`, without shell escapes. No shell reads the
argument, so quotes around a word are removed, but a backslash stays in the word
and reaches git.

When `difft` (difftastic) is on PATH, a changed code file is diffed by syntax.
These keep the line diff:

- a file added or deleted whole;
- a file difftastic can't parse;
- every file, when the argument carries an option that changes how the line diff
  compares lines or groups them into hunks, such as a whitespace option, `-W` or
  a diff algorithm, since difftastic has nothing that matches it.

`-U` sets the number of context lines in both kinds of diff.
