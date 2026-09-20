// What is particular to this plugin's tests: where its files are, the exact
// commands `hooks.json` runs, the transcripts and configuration files a case
// points them at, and what a measuring run left behind. The root harness holds
// what every plugin's tests share: the runtimes, the throwaway directories, the
// session ids and the spawn itself. A test file imports both. Importing this
// registers no test of its own.
//
// Nothing is merged under the configuration a hook is handed, so a case that
// is about one section still has to write a whole file. The sections below are
// what a case that has no opinion about the rest composes one from.
import assert from "node:assert/strict";
import {
	appendFileSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { faultChecks } from "../../../tests/fault-checks.mts";
import {
	childTemp,
	dataDir,
	fixtureDir,
	type HookRun,
	sessionId as pluginSessionId,
	type Result,
	type Runtime,
	runHook,
	type Started,
	startHook,
} from "../../../tests/harness.mts";
import { SOCKET_VARIABLE, TOKEN_VARIABLE } from "../lib/inbox.mts";

export interface RunOptions {
	/** A copy of the hooks somewhere they are broken; the installed ones by default. */
	readonly launcher?: string;
	/** Written on stdin in place of the input, for a case about what is on it. */
	readonly stdin?: string | undefined;
	/** Appended to the entry's own arguments, as `hooks.json` appends some. */
	readonly args?: readonly string[];
	/** Set in the child, for a case about what an entry reads there. */
	readonly env?: Readonly<Record<string, string>>;
}

/** The plugin's own directory, which every path a case passes is built from. */
export const PLUGIN = join(fileURLToPath(new URL(".", import.meta.url)), "..");

export const HOOKS = join(PLUGIN, "hooks");
export const LAUNCHER = join(PLUGIN, "lib", "shared", "launch.mjs");

/** The failure policy every entry reports through. */
export const { withoutParser, reported, quiet, addressedTo } =
	faultChecks(PLUGIN);

/** The thresholds a case that is not about thresholds runs on. */
export const DEFAULTS = "[default]\nnotice = 150_000\nurgent = 250_000\n";

/** The `[messages]` every file has to carry. */
export const MESSAGES =
	'[messages]\nnotice = "NOTICE {tokens} over {threshold}"\nurgent = "URGENT {tokens} over {threshold}"\n';

export const GUARD = "[resume-guard]\nlarge = 150_000\ncold = 50_000\n";

export const GUARD_MESSAGES =
	'[resume-guard.messages]\ndenied = "DENIED {agent}: {reasons}"\nused = "USED {agent}: {reasons}"\n';

/**
 * A whole file that does not parse, which is the same fault on every run.
 * Config text, as every constant above is: a case writes it with `configFile`
 * and hands a hook the path that comes back.
 */
export const BROKEN = "[resume-guard\nlarge = 10\n";

/**
 * A whole file every entry can use, which is that fault fixed. Config text
 * too, and what a case with no opinion about any one section runs on.
 */
export const USABLE = [DEFAULTS, MESSAGES, GUARD, GUARD_MESSAGES].join("\n");

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

/**
 * A transcript path no entry can read, and not because it is absent: Node and
 * bun both refuse a path with a NUL byte in it outright, and that is neither
 * the absence a reader tolerates nor anything else the plugin accounts for.
 * Every entry opens the transcript Claude Code names it, so each meets this in
 * its own work, which is what makes it that entry's own `internal` fault.
 */
export const unreadableTranscript = (): string =>
	"\u0000no-such-transcript.jsonl";

export function transcript(...lines: readonly string[]): string {
	const path = join(fixtureDir("transcript"), "transcript.jsonl");

	writeFileSync(path, `${lines.join("\n")}\n`);

	return path;
}

/**
 * Adds entries to a transcript a case has already pointed a hook at: the
 * session carrying on under a run that reads the file again as it goes.
 */
export function appendTranscript(
	path: string,
	...lines: readonly string[]
): void {
	appendFileSync(path, `${lines.join("\n")}\n`);
}

/**
 * A session transcript with one subagent's transcript beside it, at the path
 * Claude Code writes: `<transcript without .jsonl>/subagents/agent-<name>.jsonl`.
 * `idleMin` past the 5m cache lifetime is what leaves that subagent's prompt
 * cache cold.
 *
 * `turns` are the subagent's own, oldest first, and `entries` are the session
 * transcript's lines. `type` writes the metadata file Claude Code writes beside
 * the transcript, naming the agent type it was launched as; a case that leaves
 * it out gets no such file, which is the subagent the guard calls "subagent".
 */
export function subagentSession(
	name: string,
	turns: readonly string[],
	entries: readonly string[],
	type?: string,
): string {
	const path = subagentBeside(name, turns, type);

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
function subagentBeside(
	name: string,
	turns: readonly string[],
	type?: string,
): string {
	const dir = fixtureDir("session");
	const subagents = join(dir, "main", "subagents");

	mkdirSync(subagents, { recursive: true });
	writeFileSync(
		join(subagents, `agent-${name}.jsonl`),
		`${turns.join("\n")}\n`,
	);

	if (type !== undefined) {
		writeFileSync(
			join(subagents, `agent-${name}.meta.json`),
			JSON.stringify({ agentType: type }),
		);
	}

	return join(dir, "main.jsonl");
}

/** How a case calls one of this plugin's entries, and what comes back. */
export type Runs<T> = (
	entry: string,
	input: Record<string, unknown>,
	config: string,
	options?: RunOptions,
) => T;

/**
 * Runs a hook as `hooks.json` does, under one runtime: the launcher reads
 * which interpreter a leg is about from `.runtime` in the data directory it is
 * given, and names the entry relative to the plugin directory.
 */
export function hookRunner(runtime: Runtime): Runs<Result> {
	const data = dataDir(runtime);

	return (entry, input, config, options = {}) =>
		runHook(hookRun(data, entry, input, config, options));
}

/**
 * The same run, left going, for a case about an entry that works on after the
 * hook call: the async Stop entries, which Claude Code starts this way and
 * waits for nothing from.
 */
export function hookStarter(runtime: Runtime): Runs<Started> {
	const data = dataDir(runtime);

	return (entry, input, config, options = {}) =>
		startHook(hookRun(data, entry, input, config, options));
}

/**
 * The environment one run's child is given: the two variables a session names
 * its inbox in taken out, and what the case asked for over them.
 *
 * These tests run inside a Claude Code session as often as not, and the cache
 * wake posts to whatever inbox its environment names, so a child that
 * inherited the real pair would put its wakes into the session running the
 * tests. Each key is set to `undefined` rather than left out: the root harness
 * spreads the whole of `process.env` under this, and only a key named here
 * takes the inherited one away. A case about the inbox names its own over
 * these.
 */
export const hookEnv = (
	env: RunOptions["env"] = {},
): Readonly<Record<string, string | undefined>> => ({
	[SOCKET_VARIABLE]: undefined,
	[TOKEN_VARIABLE]: undefined,
	...env,
});

/** One run of an entry, as this plugin's `hooks.json` calls for it. */
const hookRun = (
	data: string,
	entry: string,
	input: Record<string, unknown>,
	config: string,
	options: RunOptions,
): HookRun => ({
	launcher: options.launcher ?? LAUNCHER,
	data,
	temp: childTemp("context-budget", input),
	argv: [`hooks/${entry}`, "--config", config, ...(options.args ?? [])],
	input,
	stdin: options.stdin,
	env: hookEnv(options.env),
});

interface Injection {
	readonly hookSpecificOutput?: { readonly additionalContext?: string };
}

/**
 * The level a run of the measurement hook announced to `session`, and null for
 * a run that announced nothing. The level is read off the record the run left,
 * so no case has to match the wording `[messages]` gave the text.
 */
export function announced(session: string, result: Result): string | null {
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stderr, "");

	if (result.stdout === "") {
		return null;
	}

	const output = JSON.parse(result.stdout) as Injection;

	return output.hookSpecificOutput?.additionalContext
		? String(record(session)["level"])
		: null;
}

/** The session's record, as the file on disk spells it. */
export function record(session: string): Record<string, unknown> {
	const file = join(
		childTemp("context-budget", { session_id: session }),
		"claude-context-budget",
		`${session}.json`,
	);

	return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
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
