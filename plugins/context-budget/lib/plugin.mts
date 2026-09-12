// Who this plugin is to the shared sources under `lib/shared/`: the name every
// report opens with, the temp directory its per-session files go in, and what
// each kind of fault costs the session while it stands.
//
// * `SESSION_STATE` is the record this plugin keeps per session
// * `CONFIG_FAULTS` is what a fault of the configuration costs
// * `NOTICE_FAULTS`, `GUARD_FAULTS`, `WATCHER_FAULTS` and `WAKE_FAULTS` are
//   what one entry's own failure costs, one policy per entry
import { faults } from "./shared/fault.mts";
import { sessionState } from "./shared/session-state.mts";

export const SESSION_STATE = sessionState("claude-context-budget");

/** One failure policy of this plugin, worded by what the fault costs. */
const policy = (consequence: string) => faults("context-budget", consequence);

/**
 * What a fault of the configuration file or of the parser that reads it costs.
 * Every entry goes through both, so one fault stops all four and the line says
 * all four. Raised by the configuration reader and by nothing else.
 */
export const CONFIG_FAULTS = policy(
	"The context notice, the watcher, the resume guard and the cache wake are off for this session",
);

// One entry's own run coming apart leaves the other three working, so each
// line below names its own entry and nothing else: a line naming all four
// sends the user looking for a plugin that is not broken. Each entry hands its
// policy to `runEntry`, which words an error no fault was raised for.

export const NOTICE_FAULTS = policy(
	"The context notice is off for this session",
);

export const GUARD_FAULTS = policy("The resume guard is off for this session");

export const WATCHER_FAULTS = policy("The watcher is off for this session");

export const WAKE_FAULTS = policy("The cache wake is off for this session");
