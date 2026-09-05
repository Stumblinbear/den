// What is particular to this plugin's tests: where its files are, the exact
// commands `hooks.json` runs, and the transcripts and configuration files a
// case points them at. Everything the plugins' tests share -- the runtimes,
// the throwaway directories, the session ids and the spawn itself -- is in the
// root harness, which a test file imports alongside this one. Importing this
// registers no test of its own.
//
// Nothing is merged under the configuration a hook is handed, so a case that
// is about one section still has to write a whole file. The sections below are
// what a case that has no opinion about the rest composes one from.
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
	/** A copy of the hooks somewhere they are broken; the installed ones by default. */
	readonly launcher?: string;
	/** Written on stdin in place of the input, for a case about what is on it. */
	readonly stdin?: string | undefined;
}

const PLUGIN = join(fileURLToPath(new URL(".", import.meta.url)), "..");

export const HOOKS = join(PLUGIN, "hooks");
export const LAUNCHER = join(PLUGIN, "lib", "launch.mjs");

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

/** An assistant turn whose usage sums to `tokens`, the shape a hook measures. */
export const assistantTurn = (
	tokens: number,
	model = "claude-fable-5-1",
): string =>
	JSON.stringify({
		type: "assistant",
		isSidechain: false,
		message: { model, usage: usage(tokens) },
	});

/**
 * A session transcript with one subagent's transcript beside it, at the path
 * Claude Code writes: `<transcript without .jsonl>/subagents/agent-<name>.jsonl`.
 * `idleMin` past the 5m cache lifetime is what leaves that subagent's prompt
 * cache cold.
 */
export function subagentSession(
	name: string,
	tokens: number,
	idleMin: number,
	entries: readonly string[],
): string {
	const path = subagentBeside(name, tokens, idleMin);

	writeFileSync(path, `${entries.join("\n")}\n`);

	return path;
}

/**
 * The same subagent with nothing at all where the session's own transcript
 * belongs: what the guard is handed when Claude Code names a transcript that
 * has been moved away under it.
 */
export const lostSession = (name: string, tokens: number): string =>
	subagentBeside(name, tokens, 0);

/**
 * The same again with a directory in the transcript's place, which is a read
 * that fails on something other than the file being absent.
 */
export function unreadableSession(name: string, tokens: number): string {
	const path = subagentBeside(name, tokens, 0);

	mkdirSync(path);

	return path;
}

/**
 * The subagent's transcript alone, and the path the session's own would be at
 * beside it, which is what a hook is handed and derives the other from.
 */
function subagentBeside(name: string, tokens: number, idleMin: number): string {
	const dir = fixtureDir("session");
	const subagents = join(dir, "main", "subagents");

	mkdirSync(subagents, { recursive: true });
	writeFileSync(
		join(subagents, `agent-${name}.jsonl`),
		`${JSON.stringify({
			type: "assistant",
			timestamp: new Date(Date.now() - idleMin * 60_000).toISOString(),
			message: { usage: usage(tokens) },
		})}\n`,
	);

	return join(dir, "main.jsonl");
}

const usage = (tokens: number) => ({
	input_tokens: 1000,
	cache_creation_input_tokens: 1000,
	cache_read_input_tokens: tokens - 2000,
});

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

/** A session id nothing else in this run has used. */
export const sessionId = (runtime: Runtime): string =>
	pluginSessionId("context-budget", runtime);
