// Root `npm install`/`npm ci` postinstall. Two jobs, both of them setup a
// checkout needs and neither of them anything a plugin user ever runs: point
// git at the tracked hook directory, and install each plugin's own
// dependencies so the root `tsc` can resolve them.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGINS = join(ROOT, "plugins");

// Neither step is worth failing an install over: a tarball or an archive
// export has no git directory, and a plugin whose dependencies did not install
// only costs the type checker its `smol-toml` types.
function run(command: string, args: readonly string[], cwd: string): boolean {
	const result = spawnSync(command, [...args], {
		cwd,
		stdio: "inherit",
		encoding: "utf8",
	});

	if (result.error) {
		process.stderr.write(
			`prepare: ${command} failed: ${result.error.message}\n`,
		);

		return false;
	}

	return result.status === 0;
}

// `core.hooksPath` is per-clone configuration, not something a file in the
// tree can carry, so every fresh checkout has to be told once. Outside a work
// tree there is nothing to configure.
function setHooksPath(): void {
	const inTree = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
		cwd: ROOT,
		encoding: "utf8",
	});

	if (inTree.error || inTree.status !== 0) {
		process.stderr.write(
			"prepare: not a git work tree, leaving core.hooksPath alone\n",
		);

		return;
	}

	if (!run("git", ["config", "core.hooksPath", ".githooks"], ROOT)) {
		process.stderr.write(
			"prepare: could not set core.hooksPath; the pre-commit check will not run\n",
		);
	}
}

// Each plugin is installed by the npm that is running this script, rather than
// by whatever `npm` resolves to on PATH. `--ignore-scripts` matches how Claude
// Code installs a cached plugin, so what a checkout gets is what a user gets.
function installPlugins(): void {
	// biome-ignore lint/style/noProcessEnv: npm names the running npm here and nowhere else.
	const execpath = process.env["npm_execpath"];

	if (!execpath) {
		process.stderr.write(
			"prepare: no npm is running this script; run it through `npm install`\n",
		);

		return;
	}

	for (const entry of readdirSync(PLUGINS, { withFileTypes: true })) {
		const dir = join(PLUGINS, entry.name);
		const installable =
			entry.isDirectory() && existsSync(join(dir, "package-lock.json"));

		if (
			installable &&
			!run(process.execPath, [execpath, "ci", "--ignore-scripts"], dir)
		) {
			process.stderr.write(`prepare: npm ci failed in ${dir}\n`);
		}
	}
}

setHooksPath();
installPlugins();
