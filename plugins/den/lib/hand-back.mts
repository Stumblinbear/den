// A subagent's hand-back, read from the lead's prompt that delivers it.
//
// - `subagentHandBack` names the agent whose report a prompt delivers.
//
// Claude Code 2.1.301 frames a delivered report as:
//
//   <agent-message from="<agent_id>">
//     <auto mode's note, every line indented, when it blocked or could not review>
//   [Subagent hand-back] The text below is the final report … The report follows:
//     <the report, every line indented>
//   </agent-message>

/** A delivered report, named by the agent that handed it back. */
export interface HandBack {
	/** The `agent_id` the sender's PreToolUse input carried. */
	readonly sender: string;
}

/**
 * A hand-back whose frame this reader could not make out.
 *
 * @remarks
 * Every one is den's own fault, not the user's: Claude Code reshaped the frame,
 * and the fix is to den's reading of it.
 */
export interface UnreadableHandBack {
	/** What was missing or out of shape, for the user to read. */
	readonly fault: string;
}

// Both patterns read the frame at a line's start: it may follow a line of its
// own, and the note's and the report's lines are indented, so text inside
// either never matches.
const MARKER = /^\[Subagent hand-back\]/m;

const FRAME =
	/^<agent-message from="([^"]+)"[^>]*>\n(?: {2}[^\n]*\n)*\[Subagent hand-back\]/m;

/**
 * The subagent hand-back that `prompt` delivers to the lead.
 *
 * @remarks
 * A delivered report fires the lead's UserPromptSubmit with the framed report
 * as its `prompt`, so that hook's prompt is the one to pass.
 *
 * @returns the hand-back; null for a prompt that delivers none; an unreadable
 * hand-back when the `[Subagent hand-back]` line is there but no
 * `<agent-message from="…">` line names its sender
 */
export function subagentHandBack(
	prompt: string,
): HandBack | UnreadableHandBack | null {
	if (!MARKER.test(prompt)) {
		return null;
	}

	const sender = FRAME.exec(prompt)?.[1];

	return sender === undefined
		? {
				fault:
					'the hand-back has no <agent-message from="…"> line naming its sender',
			}
		: { sender };
}
