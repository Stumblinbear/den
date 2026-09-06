// Who this plugin is to the shared sources under `lib/shared/`: the name every
// report opens with, what a fault costs while it stands, the temp directory
// its per-session files go in, and the marker the judge child is known by.
// Every entry reports through the same policy, so the first of them to meet a
// fault silences the rest. They read one configuration file through one
// parser, so a prompt run of the measurement hook that works again takes back
// a config or parser fault, whichever entry said it.
import process from "node:process";
import { faults } from "./shared/fault.mts";
import { sessionState } from "./shared/session-state.mts";

/**
 * The variable the watcher sets in its judge, and the whole of what tells an
 * entry it is running inside one. The judge is a Claude Code run of its own,
 * so it fires this plugin's hooks: without the marker that child would measure
 * its own context against the session's record, count its own turns into it
 * and start a judge of its own. `--bare` would skip every hook instead, but it
 * wants an API key, and the judge runs on the user's subscription.
 */
export const JUDGE = "CONTEXT_BUDGET_JUDGE";

/**
 * Whether this process is the watcher's judge or something it started. Any
 * value at all says so: the watcher writes `1`, and nothing else writes it.
 * Every entry reads it before it loads the configuration, since a run inside
 * that child proves nothing about a file it never opened.
 */
export const insideJudge = (): boolean =>
	// biome-ignore lint/style/noProcessEnv: configuration reaches a hook through argv, but this marker has to cross a process boundary the plugin does not compose the command line of.
	(process.env[JUDGE] ?? "") !== "";

export const SESSION_STATE = sessionState("claude-context-budget");

export const FAULTS = faults(
	"context-budget",
	"The context notice, the watcher and the resume guard are off for this session",
	SESSION_STATE,
);

/**
 * The same policy, for the one fault that costs the session less than the rest
 * of them: a judge that will not start leaves the notice and the guard
 * measuring and guarding, and a line saying otherwise would send the user
 * looking for a plugin that is still working.
 */
export const WATCHER_FAULTS = faults(
	"context-budget",
	"The watcher is off for this session",
	SESSION_STATE,
);
