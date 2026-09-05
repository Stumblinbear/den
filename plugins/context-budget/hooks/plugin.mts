// Who this plugin is to the shared sources under `lib/`: the name every report
// opens with, what a fault costs while it stands, and the temp directory its
// per-session files go in. Both hooks report through the same one, so the
// first of them to meet a fault silences the other for the session.
import { faults } from "../lib/fault.mts";
import { sessionState } from "../lib/session-state.mts";

export const SESSION_STATE = sessionState("claude-context-budget");

export const FAULTS = faults(
	"context-budget",
	"The context notice and the resume guard are off for this session",
	SESSION_STATE,
);
