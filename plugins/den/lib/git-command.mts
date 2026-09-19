// A git command run from this process: the environment and limits every run
// shares, and what a run printed or why it failed.
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import process from "node:process";

// git prints a non-ASCII path quoted and escaped under the default
// core.quotePath, which names no file and drops the untracked hunk for it.
const GIT_ENV = {
	// biome-ignore lint/style/noProcessEnv: git needs the session's PATH and HOME; the three below are what this run adds.
	...process.env,
	GIT_CONFIG_COUNT: "1",
	GIT_CONFIG_KEY_0: "core.quotePath",
	GIT_CONFIG_VALUE_0: "false",
};

// A diff of any size is the point, so no call here keeps Node's 1 MiB
// default: past it the child is killed and `error` is set with no stderr,
// which reads as git failing for no reason.
export const RUN = {
	encoding: "utf8",
	env: GIT_ENV,
	maxBuffer: Infinity,
} as const;

/** What a git run printed, or the line saying why it failed. */
export type Output = { readonly out: string } | { readonly failure: string };

/**
 * Why a run gave no diff. A run that did not start, or was killed (past
 * `maxBuffer`, say), carries the cause in `error` and has no stderr; a run
 * that failed carries it in stderr.
 */
export const reason = (run: SpawnSyncReturns<string>): string =>
	run.error?.message ?? run.stderr.trim();

/** Runs git where this process runs, `command` naming it in a failure. */
export function git(args: readonly string[], command: string): Output {
	const run = spawnSync("git", args, RUN);

	return run.status === 0
		? { out: run.stdout }
		: { failure: `\`${command}\` failed: ${reason(run)}` };
}
