# den

A Claude Code plugin: a coordinated, gated agent workflow plus a few craft skills.

## What is in it

Skills (invoke as `/den:<name>`):

- `coordination` - rules for the main session: delegate production work, cite code by path and line, one authorization per agent launch, fresh reviewer per task, comment pass before every commit. Invoke it yourself at the start of a session; it is never loaded automatically and never reaches subagents.
- `flag-review` - launches `den:flag-reviewer` on the pending diff. Its first message carries the status, the stat, and the diff itself when it fits under the inline output ceiling; past that, the reviewer pulls the diff per file. Optional argument: a git diff range (default: working tree against HEAD).
- `comment-review` - the same for `den:comment-reviewer`.
- `code-architecture` - where a type, function, or module belongs; preloaded into the flag-reviewer, and invoked by implementers as they write.
- `writing-for-agents` - principles for writing instructions for LLM agents, with the sourced report beside it.
- `unsafety-author` - Rust `# Safety` contracts and unsafe docs to the std/bevy bar.

Agents (`den:<name>` in the Agent tool):

- `flag-reviewer` (fable) - flag-only code and architecture review; never edits.
- `comment-reviewer` (opus) - comment coverage and voice on a pending change.
- `implementer-opus`, `implementer-haiku`, `implementer-fable` - execute a pinned brief; declare deviations; stop on broken assumptions.
- `red-green-fixer` (opus) - reproduces a finding as a failing test, then fixes to green.
- `prior-art-check` (opus) - how the problem is already solved, before an approach is chosen.
- `surveyor` (sonnet), `file-peek` (haiku) - read-only evidence sweeps and targeted extraction from large files.
- `synthesizer` (opus) - one ranked decision document from proposals and verdicts.
- `localizer`, `localization-reviewer` (opus) - natural target-language localization and its review.

Hooks (registered while the plugin is enabled):

- SubagentStop + UserPromptSubmit relays that remind the main session to triage a finished reviewer's findings, and to treat IDE diagnostics as stale after an implementer edited Rust sources (an implementer that touched no .rs file leaves no reminder).
- SessionStart + PostModelSwitch: injects a writing rule into the main session when the model is Opus 5.

## Install

In Claude Code:

```
/plugin marketplace add stumblinbear/den
/plugin install den@den
```

The marketplace is assumed to live at the GitHub repository `stumblinbear/den`. Then run `/reload-plugins` if the install summary asks for it, and `/den:coordination` at the start of a session where the workflow rules should apply.

## Releasing

Releases are cut by the `Release` GitHub Actions workflow; nothing is bumped
or tagged by hand. The `version` field in `plugin.json` is the update
trigger for installed users, so work on `master` freely and release
deliberately. The workflow releases one plugin per run — every plugin under
`plugins/` carries its own version, changelog, and `<plugin>--v*` tags.

1. Add each notable change to the `Unreleased` section of that plugin's
   `plugins/<plugin>/CHANGELOG.md` as you go. The workflow refuses to release
   an empty section.
2. Run the workflow from the Actions tab with the plugin and version to
   release, or:

   ```
   gh workflow run release.yml -f plugin=den -f version=1.0.0
   ```

3. The workflow validates `master`, runs `.github/scripts/prepare-release.mjs`
   to bump that plugin's `plugin.json` and date its changelog section,
   validates the result again, and only then pushes
   `Release <plugin> x.y.z` to `master`, pushes the `<plugin>--vx.y.z` tag,
   and publishes a GitHub release with that section as its notes. A failure at
   any check leaves `master` and the tags untouched. If a run fails after the
   push, rerun it with `version` set to that same version: the script
   recognizes the bump is already in place and the remaining steps skip
   whatever already exists.
4. On a machine installed from GitHub, `/plugin marketplace update den` then
   `/plugin update den@den` picks it up.
