// Who this plugin is to the shared sources under `lib/shared/`: the name every
// report opens with, what a fault costs while it stands, and the temp
// directory its per-session files go in. Both hooks report through the same
// one, so the first of them to meet a fault silences the other. They read one
// configuration file through one parser, so a prompt run of the measurement
// hook that works again takes back a config or parser fault, whichever hook
// said it.
import { faults } from "./shared/fault.mts";
import { sessionState } from "./shared/session-state.mts";

export const SESSION_STATE = sessionState("claude-context-budget");

export const FAULTS = faults(
	"context-budget",
	"The context notice and the resume guard are off for this session",
	SESSION_STATE,
);
