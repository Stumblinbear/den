// What is particular to this plugin's tests: where its files are, the exact
// command `hooks.json` runs, and throwaway files for a case to point it at.
// The root harness holds everything the plugins' tests share: the runtimes, the
// throwaway directories, the session ids and the spawn itself. A test file
// imports it alongside this one. Importing this registers no test of its own.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { faultChecks } from "../../../tests/fault-checks.mts";
import {
	childTemp,
	dataDir,
	fixtureDir,
	sessionId as pluginSessionId,
	type Result,
	type Runtime,
	runHook,
} from "../../../tests/harness.mts";

export interface RunOptions {
	/** A copy of the hook somewhere it is broken; the installed one by default. */
	readonly launcher?: string;
	/** A home whose settings.json the run is meant to read. */
	readonly home?: string;
}

const PLUGIN = join(fileURLToPath(new URL(".", import.meta.url)), "..");

export const HOOKS = join(PLUGIN, "hooks");
export const LAUNCHER = join(PLUGIN, "lib", "shared", "launch.mjs");

/** The failure policy the hook reports through, in this plugin's name. */
export const { withoutParser, reported, quiet } = faultChecks(
	"model-prompts",
	PLUGIN,
);

/** The entry `hooks.json` names, relative to the plugin directory. */
const ENTRY = "hooks/model-prompts";

// A home with no settings.json, so a test that does not mean to exercise the
// SessionStart fallback cannot accidentally pick up the real one.
const BARE_HOME = fixtureDir("bare-home");

export function configFile(contents: string): string {
	const path = join(fixtureDir("config"), "config.toml");

	writeFileSync(path, contents);

	return path;
}

/** A home whose settings.json names a model, for the session start fallback. */
export function homeNaming(model: string): string {
	const home = fixtureDir("home");

	mkdirSync(join(home, ".claude"), { recursive: true });
	writeFileSync(
		join(home, ".claude", "settings.json"),
		JSON.stringify({ model }),
	);

	return home;
}

/**
 * Runs the hook as `hooks.json` does, under one runtime: the launcher reads
 * which interpreter a leg is about from `.runtime` in the data directory it is
 * given.
 */
export function hookRunner(
	runtime: Runtime,
): (
	input: Record<string, unknown>,
	config: string,
	options?: RunOptions,
) => Result {
	const data = dataDir(runtime);

	return (input, config, options = {}) => {
		const home = options.home ?? BARE_HOME;

		return runHook({
			launcher: options.launcher ?? LAUNCHER,
			data,
			temp: childTemp("model-prompts", input),
			argv: [ENTRY, "--config", config],
			input,
			env: { HOME: home, USERPROFILE: home },
		});
	};
}

/** A session id nothing else in this run has used. */
export const sessionId = (runtime: Runtime): string =>
	pluginSessionId("model-prompts", runtime);
