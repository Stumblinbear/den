// What is particular to this plugin's tests: where its files are, the exact
// commands `hooks.json` runs, and the transcripts and configuration files a
// case points them at. The root harness holds what every plugin's tests share:
// the runtimes, the throwaway directories, the session ids and the spawn
// itself. A test file imports both. Importing this registers no test of its
// own.
//
// Nothing is merged under the configuration a hook is handed, so a case that
// is about one section still has to write a whole file. The sections below are
// what a case that has no opinion about the rest composes one from.
import assert from "node:assert/strict";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
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
	standingLock,
} from "../../../tests/harness.mts";

export interface RunOptions {
	/** A copy of the hooks somewhere they are broken; the installed ones by default. */
	readonly launcher?: string;
	/** Written on stdin in place of the input, for a case about what is on it. */
	readonly stdin?: string | undefined;
}

const PLUGIN = join(fileURLToPath(new URL(".", import.meta.url)), "..");

export const HOOKS = join(PLUGIN, "hooks");
export const LAUNCHER = join(PLUGIN, "lib", "shared", "launch.mjs");

/** The failure policy both hooks report through, in this plugin's name. */
export const { withoutParser, reported, quiet } = faultChecks(
	"context-budget",
	PLUGIN,
);

/** The thresholds a case that is not about thresholds runs on. */
export const DEFAULTS = "[default]\nnotice = 150_000\nurgent = 250_000\n";

/** The injected text is the user's, so the tests write what they assert on. */
export const MESSAGES =
	'[messages]\nnotice = "NOTICE {tokens} over {threshold}"\nurgent = "URGENT {tokens} over {threshold}"\n';

export const GUARD = "[resume-guard]\nlarge = 150_000\ncold = 50_000\n";

export const GUARD_MESSAGES =
	'[resume-guard.messages]\ndenied = "DENIED {agent}: {reasons}"\nused = "USED {agent}: {reasons}"\n';

/** The sections joined into one file, as the hooks read them. */
export function configFile(...sections: readonly string[]): string {
	const path = join(fixtureDir("config"), "config.toml");

	writeFileSync(path, sections.join("\n"));

	return path;
}

/** A path where no file has been written, which is the unconfigured state. */
export const noConfig = (): string =>
	join(fixtureDir("no-config"), "never-written.toml");

/** A path where no transcript has been written, which is a session with none. */
export const noTranscript = (): string =>
	join(fixtureDir("no-transcript"), "transcript.jsonl");

export function transcript(...lines: readonly string[]): string {
	const path = join(fixtureDir("transcript"), "transcript.jsonl");

	writeFileSync(path, `${lines.join("\n")}\n`);

	return path;
}

/**
 * A session transcript with one subagent's transcript beside it, at the path
 * Claude Code writes: `<transcript without .jsonl>/subagents/agent-<name>.jsonl`.
 * `idleMin` past the 5m cache lifetime is what leaves that subagent's prompt
 * cache cold.
 *
 * `turns` are the subagent's own, oldest first, and `entries` are the session
 * transcript's lines.
 */
export function subagentSession(
	name: string,
	turns: readonly string[],
	entries: readonly string[],
): string {
	const path = subagentBeside(name, turns);

	writeFileSync(path, `${entries.join("\n")}\n`);

	return path;
}

/**
 * The same subagent with nothing at all where the session's own transcript
 * belongs: what the guard is handed when Claude Code names a transcript that
 * has been moved away under it.
 */
export const lostSession = (name: string, turns: readonly string[]): string =>
	subagentBeside(name, turns);

/**
 * The same again with a directory in the transcript's place, which is a read
 * that fails on something other than the file being absent.
 */
export function unreadableSession(
	name: string,
	turns: readonly string[],
): string {
	const path = subagentBeside(name, turns);

	mkdirSync(path);

	return path;
}

/**
 * The subagent's transcript alone, and the path the session's own would be at
 * beside it, which is what a hook is handed and derives the other from.
 */
function subagentBeside(name: string, turns: readonly string[]): string {
	const dir = fixtureDir("session");
	const subagents = join(dir, "main", "subagents");

	mkdirSync(subagents, { recursive: true });
	writeFileSync(
		join(subagents, `agent-${name}.jsonl`),
		`${turns.join("\n")}\n`,
	);

	return join(dir, "main.jsonl");
}

/**
 * Runs a hook as `hooks.json` does, under one runtime: the launcher reads
 * which interpreter a leg is about from `.runtime` in the data directory it is
 * given, and names the entry relative to the plugin directory.
 */
export function hookRunner(
	runtime: Runtime,
): (
	entry: string,
	input: Record<string, unknown>,
	config: string,
	options?: RunOptions,
) => Result {
	const data = dataDir(runtime);

	return (entry, input, config, options = {}) =>
		runHook({
			launcher: options.launcher ?? LAUNCHER,
			data,
			temp: childTemp("context-budget", input),
			argv: [`hooks/${entry}`, "--config", config],
			input,
			stdin: options.stdin,
		});
}

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

/**
 * A session record the way a real session gets one: by running the
 * measurement hook. Writing the file by hand would let the two drift, and the
 * script reading a shape the hook had stopped writing is exactly the failure
 * the cut-point cases exist for.
 */
export function recorder(
	runtime: Runtime,
): (session: string, transcriptPath: string) => Result {
	const hook = hookRunner(runtime);
	const config = configFile(DEFAULTS, MESSAGES, GUARD, GUARD_MESSAGES);

	return (session, transcriptPath) =>
		hook(
			"context-budget",
			{
				hook_event_name: "UserPromptSubmit",
				session_id: session,
				transcript_path: transcriptPath,
			},
			config,
		);
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

/** The session's record, as the file on disk spells it. */
export function record(session: string): Record<string, unknown> {
	const file = join(
		childTemp("context-budget", { session_id: session }),
		"claude-context-budget",
		`${session}.json`,
	);

	return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

/**
 * The record's lock, taken the way `file-lock.mts` takes one and never
 * released: what a run finds when another run of the same session is inside
 * its own change of the record. The holder named is this process, which is a
 * run still working; a lock naming a run that has ended is taken over by the
 * hook rather than waited on.
 */
export function holdLock(session: string): void {
	standingLock(
		join(
			childTemp("context-budget", { session_id: session }),
			"claude-context-budget",
			`${session}.lock`,
		),
		process.pid,
	);
}

/** Everything the session has left in the plugin's temp directory. */
export function stateFiles(session: string): readonly string[] {
	const dir = join(
		childTemp("context-budget", { session_id: session }),
		"claude-context-budget",
	);

	try {
		return readdirSync(dir).sort();
	} catch {
		// Nothing has been written for this session at all.
		return [];
	}
}

/** A session id nothing else in this run has used. */
export const sessionId = (runtime: Runtime): string =>
	pluginSessionId("context-budget", runtime);
