#!/usr/bin/env bash
# Renders the review scope for the flag-review and comment-review skills:
# repository, range, status, stat, and the diff itself when it fits.
#
# Skill substitution output past roughly 30,000 characters is replaced by a
# file path plus a 2KB preview, which the reviewer then reads back in chunks
# at a higher token cost than pulling the diff itself. So the diff is inlined
# only when the whole rendering stays under that ceiling; otherwise the stat
# serves as the map and the reviewer pulls per file, the way hand-launched
# reviewers already work.
#
# The skill passes its whole argument string as one word so shell
# metacharacters in it reach this script instead of breaking the harness
# eval. Split it back into `git diff` arguments here; none means HEAD.
set -u

read -ra args <<< "${1-}"
if [ "${#args[@]}" -eq 0 ]; then
  args=(HEAD)
fi
set -- "${args[@]}"
range="$*"

# The revision part alone, for the per-file commands suggested to the
# reviewer: any `-- <path>` in the arguments would double up with theirs.
revs=""
for arg in "$@"; do
  if [ "$arg" = "--" ]; then
    break
  fi
  revs="${revs:+$revs }$arg"
done

if ! root=$(git rev-parse --show-toplevel 2>&1); then
  printf 'Not inside a git repository: %s\n' "$root"
  exit 0
fi

# Warnings git prints on success (line-ending notices under core.autocrlf)
# would otherwise land inside the diff fence, so stderr is kept apart and
# shown only when the command fails.
if ! diff=$(git diff --no-color --no-ext-diff --diff-algorithm=histogram "$@" 2>/dev/null); then
  printf '`git diff %s` failed:\n' "$range"
  git diff --no-color --no-ext-diff "$@" 2>&1 >/dev/null
  exit 0
fi

# --porcelain keeps status paths root-relative like the stat and diff headers,
# whatever the session shell's cwd or the user's status config.
header=$(
  printf 'Repository: %s\n' "$root"
  printf 'Range: `git diff %s`\n\n' "$range"
  printf 'Status (untracked files are not in the diff):\n```\n'
  git status --porcelain
  printf '```\n\nStat:\n```\n'
  git diff --no-color --stat=110 "$@"
  printf '```\n'
)

printf '%s\n\n' "$header"

if [ -z "$diff" ]; then
  printf 'The diff is empty.\n'
  exit 0
fi

# The inline ceiling is only roughly 30,000 characters, and bash counts bytes
# here where the tool counts characters, so the budget keeps a margin.
budget=26000
rendered=$(( ${#header} + ${#diff} ))
if [ "$rendered" -le "$budget" ]; then
  printf 'Diff:\n````diff\n%s\n````\n' "$diff"
else
  printf 'Status, stat, and diff together come to %s characters, past the inline ceiling, so the diff is not rendered here. ' "$rendered"
  printf 'Pull it per file with `git diff %s -- <path>`. ' "$revs"
  printf 'A single file past about 500 changed lines overflows the same ceiling; slice it, for example `git diff %s -- <path> | sed -n "1,400p"`.\n' "$revs"
fi
