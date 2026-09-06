// The cut-point script as a case runs it: the command the skill's preamble
// builds, the price files it is handed, and the reading it prints. Its own
// module because nothing here is a hook, and the harness beside it is what
// `hooks.json` runs. Importing this registers no test of its own.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	childTemp,
	dataDir,
	fixtureDir,
	type Result,
	type Runtime,
	runHook,
} from "../../../tests/harness.mts";
import { LAUNCHER, PLUGIN } from "./harness.mts";

/**
 * Runs the cut-point script the way the skill's preamble does: through the
 * same launcher, with both pricing paths and the session id on the command
 * line, which is what Claude Code substitutes into that preamble. An empty
 * session id is a hand run, which passes no `--session` at all. The temp
 * directory is the session's own, so the script reads the record the hook run
 * before it wrote.
 */
export function scriptRunner(
	runtime: Runtime,
): (session: string, args?: readonly string[], overrides?: string) => Result {
	const data = dataDir(runtime);

	return (session, args = [], overrides = noPricing()) =>
		runHook({
			launcher: LAUNCHER,
			data,
			temp: childTemp("context-budget", { session_id: session }),
			argv: [
				"scripts/cut-point",
				...(session === "" ? [] : ["--session", session]),
				...args,
				"--pricing",
				join(PLUGIN, "lib", "pricing.toml"),
				"--pricing-overrides",
				overrides,
			],
			input: {},
		});
}

/** The reading alone, from a script run that had nothing to report. */
export function reading(result: Result): string {
	assert.equal(result.stderr, "", "nothing to report on a shipped price table");
	assert.equal(
		result.status,
		0,
		"the reading is prose, so the exit is always 0",
	);

	return result.stdout;
}

/**
 * A pricing override file, or a path to one that is not there. Almost nobody
 * corrects a published price, so the absent file is the normal case.
 */
export function pricingOverride(toml: string): string {
	const path = join(fixtureDir("pricing"), "pricing.toml");

	writeFileSync(path, toml);

	return path;
}

const noPricing = (): string =>
	join(fixtureDir("no-pricing"), "never-written.toml");
