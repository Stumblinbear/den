// What the watcher cases share: a judge the case can see, the configuration
// pointing the watcher at it, the Stop a case runs, and the conversations it
// reads. Every case runs the real entry through the launcher, since the whole
// of what is under test is what one run leaves in the record for the next.
// Importing this registers no test of its own.
//
// The thresholds are the harness's own, 150K and 250K, so the midpoint the
// watcher halves its longest wait past is 200K.
import assert from "node:assert/strict";
import { join } from "node:path";
import type { Result, Runtime } from "../../../tests/harness.mts";
import { assistant, at, prompt, type TurnOptions } from "./fixtures.mts";
import {
	configFile,
	hookRunner,
	PLUGIN,
	sessionId,
	transcript,
	USABLE,
} from "./harness.mts";
import { type Judge, judge, type Shim } from "./judge-fixture.mts";

/** The two price files `hooks.json` passes the watcher, as it passes them. */
export const PRICING: readonly string[] = [
	"--pricing",
	join(PLUGIN, "lib", "pricing.toml"),
	"--pricing-overrides",
	join(PLUGIN, "lib", "no-such-overrides.toml"),
];

/** Past the notice threshold and under the midpoint. */
export const NOTICE = 160_000;

/** Past the midpoint, where the longest wait is halved. */
export const MIDPOINT = 210_000;

/** Past the urgent threshold, where the judge is never consulted. */
export const URGENT = 260_000;

/** Under every threshold. */
export const QUIET = 100_000;

/** The uuid of the newest entry, which every conversation below ends on. */
export const NEWEST = "newest-entry";

/** The answer that paces the judge: not yet, and the longest wait. */
export const LATER = { good: false, wait: "later" };

/** A commit, as the transcript records the tool call that made one. */
export const COMMITTED = [
	{
		name: "Bash",
		input: { command: 'git add -A && git commit -m "wire the watcher in"' },
	},
];

/** A good answer, in the bare shape a judge of the user's own would write. */
export const GOOD = {
	good: true,
	option: "compact",
	focus: "wiring the watcher into the session record, task #30",
	reason: "the record change is landed and its tests are green",
};

/** The runs a watcher case makes, under one runtime. */
export interface WatcherRuns {
	readonly judge: Judge;
	/** The configuration the entry is handed. */
	readonly config: string;
	/** A session id nothing else in this run has used. */
	session(): string;
	/** One Stop, which is one end of a turn to the watcher. */
	stop(id: string, path: string): Result;
}

/** What a case wants written under `[watcher]` in place of the defaults. */
export interface WatcherConfig {
	/** Extra lines, for a case about one of the table's other keys. */
	readonly under?: string;
	/** In place of the judge fixture, for a case about a judge that is not there. */
	readonly command?: readonly string[];
	/** Words written after the fixture judge's own, as the file writes them. */
	readonly args?: readonly string[];
	/**
	 * The fixture judge reached through a `.cmd` named by a bare word, which is
	 * the spawn Windows retries through its command interpreter.
	 */
	readonly shim?: boolean;
}

export function watcherRuns(
	runtime: Runtime,
	config: WatcherConfig = {},
): WatcherRuns {
	const hook = hookRunner(runtime);
	const seen = judge(runtime);
	const shim = config.shim === true ? seen.shim() : null;
	const written = configFile(USABLE, section(seen, config, shim));

	return {
		judge: seen,
		config: written,
		session: () => sessionId(runtime),
		stop: (id, path) =>
			hook(
				"watcher",
				{
					hook_event_name: "Stop",
					session_id: id,
					transcript_path: path,
				},
				written,
				{
					args: PRICING,
					...(shim === null ? {} : { env: shim.env }),
				},
			),
	};
}

const section = (
	seen: Judge,
	{ command, under = "", args = [] }: WatcherConfig,
	shim: Shim | null,
): string => {
	const words = command ?? shim?.command;

	return (
		(words === undefined
			? seen.configWith(...args)
			: `[watcher]\ncommand = ${JSON.stringify(words)}\n`) + under
	);
};

/**
 * A conversation of `turns` of the user's prompts, ending in an assistant turn
 * of `tokens` whose entry is `NEWEST`. `options` is what the case wants that
 * newest entry to carry: the tools it called, or the words it said.
 *
 * `turns` is what the watcher counts a wait in, so a case that runs several
 * Stops raises it by one for each, as the session it stands for would.
 */
export function conversation(
	tokens: number,
	options: TurnOptions = {},
	turns = 2,
	...below: readonly string[]
): string {
	const earlier: string[] = [];

	for (let n = 1; n < turns; n += 1) {
		earlier.push(
			prompt(`Read the brief and start on step ${n}`, at(60 - n), {
				uuid: `earlier-prompt-${n}`,
			}),
			assistant(140_000, { minutesAgo: 60 - n, uuid: `earlier-reply-${n}` }),
		);
	}

	return transcript(
		...earlier,
		prompt("Now wire the verdict into the session record", at(20), {
			uuid: "newest-prompt",
		}),
		assistant(tokens, { minutesAgo: 5, uuid: NEWEST, ...options }),
		...below,
	);
}

interface Injection {
	readonly hookSpecificOutput?: { readonly additionalContext?: string };
}

/** What a run handed the session, and null for a run with nothing to say. */
export function injected(result: Result): string | null {
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stderr, "");

	if (result.stdout === "") {
		return null;
	}

	const output = JSON.parse(result.stdout) as Injection;

	return output.hookSpecificOutput?.additionalContext ?? null;
}
