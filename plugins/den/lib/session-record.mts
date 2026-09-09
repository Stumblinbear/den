// Where the session's transcript is, kept in den's record of the session
// under `claude-den-session/` in the OS temp directory. A hook is handed the
// path on every event; the handoff-cost script, run from a skill preamble, is
// handed a session id and nothing else, so a prompt hook leaves the path
// where the script can find it.
import { sessionState } from "./shared/session-state.mts";

export const SESSION_STATE = sessionState("claude-den-session");

/**
 * Records the transcript path, once: a session's path does not move, so a
 * record that already names it is left as it is rather than rewritten on
 * every prompt.
 */
export function recordTranscript(sessionId: string, path: string): void {
	SESSION_STATE.update(sessionId, (before) => ({
		fields: transcriptIn(before) === path ? null : { transcript_path: path },
		result: undefined,
	}));
}

/** The recorded path, or null for a session no prompt hook has seen. */
export const recordedTranscript = (sessionId: string): string | null =>
	transcriptIn(SESSION_STATE.read(sessionId));

const transcriptIn = (record: Record<string, unknown>): string | null => {
	const path = record["transcript_path"];

	return typeof path === "string" && path !== "" ? path : null;
};
