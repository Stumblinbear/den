// Runtime selector for this plugin's hooks. `hooks.json` runs this file with
// plain `node`, because that is the one interpreter every Claude Code install
// is known to have; the hooks themselves are TypeScript, so something has to
// decide what executes them. This file stays JavaScript, in syntax every Node
// release parses, so that the "your Node is too old" line can be printed by
// the Node that is too old.
//
// Loading this file launches: there is no entry guard to get wrong, and
// nothing imports it. `select-runtime.mjs` is where the choice itself lives,
// for a test that wants it without a hook run.
//
// Arguments: `--data <dir>`, the entry's basename, then the entry's own
// arguments, forwarded untouched. `<dir>/.runtime` picks the interpreter:
// `bun` or `node` force one, and no file at all prefers bun and falls back to
// Node.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { selectRuntime } from "./select-runtime.mjs";

/**
 * libuv resolves `bun.exe` through PATH without a shell, so this is the same
 * probe on every platform.
 *
 * @returns {boolean}
 */
function probeBun() {
	const probe = spawnSync("bun", ["--version"], { stdio: "ignore" });

	return !probe.error && probe.status === 0;
}

/**
 * @param {string} file
 * @returns {string}
 */
function requestedRuntime(file) {
	try {
		return readFileSync(file, "utf8").trim();
	} catch {
		// Unwritten, or unreadable and therefore saying nothing: either way the
		// user has expressed no preference.
		return "";
	}
}

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
	process.stderr.write(`${message}\n`);
	process.exit(1);
}

/**
 * The entry sits beside this launcher, and the interpreter is handed its own
 * stdio so the hook talks to Claude Code directly. The `--disable-warning`
 * alias survives into Node 26, and stripping is on by default from 22.18, so
 * the pair is a no-op there and the floor stays at 22.6 for free.
 *
 * @param {"bun" | "node"} kind
 * @param {string} name
 * @param {readonly string[]} args
 */
function spawnEntry(kind, name, args) {
	const entry = join(dirname(fileURLToPath(import.meta.url)), `${name}.mts`);

	return kind === "bun"
		? spawnSync("bun", [entry, ...args], { stdio: "inherit" })
		: spawnSync(
				process.execPath,
				[
					"--experimental-strip-types",
					"--disable-warning=ExperimentalWarning",
					entry,
					...args,
				],
				{ stdio: "inherit" },
			);
}

function main() {
	const argv = process.argv.slice(2);

	if (argv[0] !== "--data" || argv.length < 3) {
		fail(
			"launch: usage: launch.mjs --data <plugin data dir> <entry> [arguments]",
		);
	}

	const data = String(argv[1]);
	const name = String(argv[2]);

	// `hooks.json` writes `--data "${CLAUDE_PLUGIN_DATA}"`, so an unset variable
	// arrives as an empty argument. Every path built from it would then point at
	// a filesystem root, where a missing config reads as "nothing configured"
	// and the hook says nothing at all.
	if (data.trim() === "") {
		fail(
			`${name}: --data was empty, so CLAUDE_PLUGIN_DATA is unset and the plugin's data directory is unknown.`,
		);
	}

	const runtimeFile = join(data, ".runtime");
	const requested = requestedRuntime(runtimeFile);
	const bunFound = requested === "node" ? false : probeBun();
	const selected = selectRuntime(
		requested,
		bunFound,
		process.versions.node,
		runtimeFile,
	);

	if (selected.kind === "error") {
		fail(`${name}: ${selected.message}`);
	}

	const run = spawnEntry(selected.kind, name, argv.slice(3));

	if (run.error) {
		fail(`${name}: could not start ${selected.kind}: ${run.error.message}`);
	}

	// A hook killed by a signal has no exit code; treat that as a failure
	// rather than as a silent success.
	process.exit(run.status === null ? 1 : run.status);
}

main();
