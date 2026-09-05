# den

A Claude Code plugin marketplace. Three plugins live under `plugins/`, each
with its own version, changelog, README and release tag.

- [`den`](plugins/den): a gated agent workflow. Standing agents do the
  production work, every launch is authorized on its own, and two hooks remind
  the main session what to do with a finished agent. Needs Node 22.6 or newer
  for the hooks.
- [`context-budget`](plugins/context-budget): gets the agent recommending
  `/compact` or a rewind summarize before auto-compact picks the cut point,
  and guards against resuming a large or cold subagent. Needs Node 22.6 or
  newer, and a configuration file before it does anything.
- [`model-prompts`](plugins/model-prompts): injects the prompts you have
  written for a model whenever that model becomes the one in use. Needs Node
  22.6 or newer, and a configuration file before it does anything.

Each plugin's README covers what it does on your machine, how to configure it,
and how to troubleshoot it.

## Install

In Claude Code:

```
/plugin marketplace add stumblinbear/den
/plugin install den@den
/plugin install context-budget@den
/plugin install model-prompts@den
```

Install only the ones you want. Run `/reload-plugins` if the install summary
asks for it.

## Repository structure

- `plugins/<name>/`: one plugin, with its own manifest, changelog, README,
  dependencies and tests. `hooks/` holds `hooks.json`, the entry points it
  runs and the example configuration; `lib/` holds the plugin's own modules,
  and `lib/shared/` the copy of the sources below. What Claude Code installs
  imports nothing from outside the plugin directory; only the tests reach
  out, to the shared harness.
- `lib/`: the sources every plugin shares, including the launcher that picks
  an interpreter, the reader for what Claude Code writes on a hook's stdin,
  and the configuration loader. Each plugin carries a committed copy under its
  own `lib/shared/`.
- `scripts/`: the copy that keeps those in step, and the root install step
  that points git at the tracked hooks and installs each plugin's
  dependencies.
- `tests/`: the shared test harness, and the tests that belong to no single
  plugin.
- `.githooks/`: the pre-commit check.
- `.github/`: the validate and release workflows, and the release script.
- `.claude-plugin/marketplace.json`: the marketplace manifest. A new plugin is
  listed here, in `scripts/plugin-lib.mts`, and in the release workflow's
  `plugin` input.

## Developing

```sh
npm install        # tooling, the git hook path, and each plugin's dependencies
npm run check      # biome ci, tsc --noEmit and the copy check, as CI runs them
npm run fix        # biome check --write
npm run plugin-lib # copy lib/ into every plugin that takes it
npm test           # the root tests, then every plugin's
```

The toolchain wants **Node 22.6 or newer**, and CI runs the tests on that
floor as well as on the current release, under both bun and Node.

After editing anything in `lib/`, run `npm run plugin-lib`. `npm run check`
fails and names any copy that has drifted, and any file in a plugin's
`lib/shared/` that nothing puts there.

`npm install` also points `core.hooksPath` at `.githooks`, so `git commit`
runs `biome check --staged`, `tsc --noEmit` and the copy check before it
lands. The hook only checks. Fix a failure with `npm run fix` or
`npm run plugin-lib` and stage the result. Two things to know about it:

- `--staged` checks the on-disk content of every staged file, so a partially
  staged file is judged by what is in the working tree, not by what is about
  to be committed.
- A GUI git client that runs hooks without `node` on `PATH` fails the hook
  with a message saying so. Commit from a shell that has it.

Biome runs its recommended preset plus a few rules chosen one at a time;
`biome.jsonc` carries the reason for each beside it.

## Releasing

Releases are cut by the `Release` GitHub Actions workflow. Nothing is bumped
or tagged by hand. The `version` field in `plugin.json` is the update trigger
for installed users, so work on `master` freely and release deliberately. The
workflow releases one plugin per run.

1. Add each notable change to the `Unreleased` section of that plugin's
   `plugins/<plugin>/CHANGELOG.md` as you go. The workflow refuses to release
   an empty section.
2. Run the workflow from the Actions tab, picking the plugin from the dropdown
   and typing the version to release.
3. The workflow validates `master`, runs `.github/scripts/prepare-release.mts`
   to bump that plugin's `plugin.json` and date its changelog section,
   validates the result again, and only then pushes `Release <plugin> x.y.z`
   to `master`, pushes the `<plugin>--vx.y.z` tag, and publishes a GitHub
   release with that section as its notes. A failure at any check leaves
   `master` and the tags untouched. If a run fails after the push, rerun it
   with `version` set to that same version: the script recognizes the bump is
   already in place, and the remaining steps skip whatever already exists.
4. On an installed machine, `/plugin marketplace update den` then
   `/plugin update <plugin>@den` picks it up.

## Contributing

Changes go through `npm run check` and `npm test`, and every notable one is
added to the `Unreleased` section of the plugin's changelog.
