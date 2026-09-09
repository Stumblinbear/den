// PostModelSwitch hook: when the user answered "Switch model" on the handoff
// question and then switched, the switch is the go for inline
// implementation, and this says so. Claude Code adds what this event writes
// on stdout to the context, so the output is that one message or nothing.
//
// The answer is read from the transcript rather than a flag, so a switch
// after the user has typed anything else, or after a different question, is
// left alone: only the exchange standing at the moment of the switch counts.

import process from "node:process";
import { standingSwitch, switchGo } from "../lib/handoff.mts";
import { hookInput } from "../lib/shared/hook-input.mts";
import { tailEntries } from "../lib/transcript.mts";

// The event's `source` names who switched: `command` and `picker` are the
// user, and the rest (`sdk`, `auto`, `resume`) are the harness. A resume
// restores the model the user was leaving, with the answer still standing,
// so only the user's own switch is the answer carried out.
const userSwitch = (source: unknown): boolean =>
	source === "command" || source === "picker";

try {
	const input = await hookInput();
	const path = input?.["transcript_path"];
	const model = input?.["to_model"];

	// A subagent's switch is not the session's.
	if (
		input !== null &&
		!input["agent_id"] &&
		userSwitch(input["source"]) &&
		typeof path === "string" &&
		typeof model === "string" &&
		model !== ""
	) {
		const entries = tailEntries(path);

		if (entries !== null && standingSwitch(entries)) {
			process.stdout.write(switchGo(model));
		}
	}
} catch {
	// Never block a switch over a transcript that would not read.
}
