// UserPromptSubmit hook: leaves the session's transcript path where the
// handoff-cost script, which runs from a skill preamble with only a session
// id, can find it. Writes nothing to the context.
import { recordTranscript } from "../lib/session-record.mts";
import { hookInput } from "../lib/shared/hook-input.mts";

try {
	const input = await hookInput();
	const session = input?.["session_id"];
	const path = input?.["transcript_path"];

	// A subagent's prompt names its own transcript, which is not the session's.
	if (
		input !== null &&
		!input["agent_id"] &&
		typeof session === "string" &&
		session !== "" &&
		typeof path === "string" &&
		path !== ""
	) {
		recordTranscript(session, path);
	}
} catch {
	// A failed record costs one unpriced reading, not a blocked prompt.
}
