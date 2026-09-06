// Who this plugin is to the shared sources under `lib/shared/`: the name every
// report opens with, what a fault costs while it stands, and the temp
// directory its per-session files go in. The entries share one record and one
// configuration file read through one parser, so the first of them to meet a
// fault of the file or the parser silences the rest, and a prompt run of the
// measurement hook that works again takes that fault back, whichever entry
// said it. What they do not share is what one entry's own run coming apart
// costs, which is a policy per entry below.
import { faults } from "./shared/fault.mts";
import { sessionState } from "./shared/session-state.mts";

export const SESSION_STATE = sessionState("claude-context-budget");

/** One failure policy of this plugin, worded by what the fault costs. */
const policy = (consequence: string) =>
	faults("context-budget", consequence, SESSION_STATE);

/**
 * The configuration file and the parser that reads it, which every entry goes
 * through: a fault there stops all three of them, so its line says all three.
 * Raised by the configuration reader and by nothing else.
 */
export const CONFIG_FAULTS = policy(
	"The context notice, the watcher and the resume guard are off for this session",
);

// An internal error is one entry's own run coming apart, and the other two go
// on working through it, so a line naming all three would send the user looking
// for a plugin that is not broken. Each entry hands its own policy to
// `runEntry`, which is where an error that was never raised as a fault is
// worded.

export const NOTICE_FAULTS = policy(
	"The context notice is off for this session",
);

export const GUARD_FAULTS = policy("The resume guard is off for this session");

export const WATCHER_FAULTS = policy("The watcher is off for this session");
