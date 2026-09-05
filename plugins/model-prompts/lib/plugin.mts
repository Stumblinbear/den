// Who this plugin is to the shared sources under `lib/shared/`: the name every
// report opens with, what a fault costs while it stands, and the temp
// directory its per-session files go in.
import { faults } from "./shared/fault.mts";
import { sessionState } from "./shared/session-state.mts";

export const SESSION_STATE = sessionState("claude-model-prompts");

export const FAULTS = faults(
	"model-prompts",
	"No prompts are injected while this stands",
	SESSION_STATE,
);
