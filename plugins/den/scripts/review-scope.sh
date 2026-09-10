#!/usr/bin/env bash
# Renders the review skill's scope: the diff through diff-scope.sh, then the
# plan or brief the change was written to, when the argument named one.
#
# The skill passes its whole argument string as one word, the contract
# diff-scope.sh splits inside. `--plan <path>` is lifted out of that string
# here and the rest is handed on unchanged, so the range keeps every form
# diff-scope.sh accepts. The plan is rendered as a path, not inlined: the
# reviewer reads it itself, and a long plan would otherwise crowd the diff
# out of the inline budget.
set -u

read -ra args <<< "${1-}"
plan=""
rest=()
skip=0
# The `+` form: under `set -u`, bash before 4.4 treats an empty array
# expansion as unbound, and the argument is empty for a working-tree review.
for arg in ${args[@]+"${args[@]}"}; do
  if [ "$skip" -eq 1 ]; then
    plan="$arg"
    skip=0
    continue
  fi
  case "$arg" in
    --plan) skip=1 ;;
    --plan=*) plan="${arg#--plan=}" ;;
    *) rest+=("$arg") ;;
  esac
done

bash "$(dirname "$0")/diff-scope.sh" "${rest[*]-}"

if [ -n "$plan" ]; then
  printf '\nPlan or brief: `%s`\n' "$plan"
fi
