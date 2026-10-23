// The UserPromptSubmit hook of the implementer-triage relay: when the prompt
// delivers an implementer's hand-back, it takes the flag
// `implementer-triage-flag` left for that implementer and reminds the lead to
// triage the report.

import { subagentHandBack } from "../lib/hand-back.mts";
import { writePromptOutput } from "../lib/prompt-output.mts";
import {
	type Flag,
	implementerTriageDir,
	TRIAGE_CALL_RULE,
	takeFlag,
} from "../lib/relay.mts";
import { faults } from "../lib/shared/fault.mts";
import { fieldsOf } from "../lib/shared/fields.mts";
import { hookInput } from "../lib/shared/hook-input.mts";

// An unreadable hand-back is den's own fault, so `internal`; see
// `UnreadableHandBack`.
const HAND_BACK_FAULTS = faults(
	"den",
	"An implementer's hand-back gets no triage reminder while this stands",
);

// The reminder for one implementer's report. It names the triage skill and
// none of its rules; see the header of `lib/relay.mts`.
function reminder(flag: Flag): string {
	return [
		`An implementer agent reported finishing${flag.agentType ? ` (${flag.agentType})` : ""}.`,
		"If the report raises an issue, such as a deviation, a question, a stop or a failed check, invoke `den:triage` and triage it.",
		TRIAGE_CALL_RULE,
	].join(" ");
}

// The session id names the flags that are this session's to announce, and the
// prompt names the one agent whose flag it delivers.
const input = await hookInput();
const dir = input === null ? null : implementerTriageDir(input);
const prompt = fieldsOf(input)["prompt"];
const handBack =
	dir === null || typeof prompt !== "string" ? null : subagentHandBack(prompt);

if (dir !== null && handBack !== null) {
	if ("fault" in handBack) {
		writePromptOutput({
			fault: HAND_BACK_FAULTS.internalFault(new Error(handBack.fault)).message,
		});
	} else {
		const flag = takeFlag(dir, handBack.sender);

		if (flag !== null) {
			writePromptOutput({ reminder: reminder(flag) });
		}
	}
}
