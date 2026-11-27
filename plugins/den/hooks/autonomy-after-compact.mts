// The SessionStart hook that runs after a compaction and says where the
// session's autonomy stands: the rules again while it is on, since the summary
// may have lost them; a line while it is off, since the summary or a
// re-attached skill may carry rules that no longer apply; and nothing in a
// session that never used it.
import process from "node:process";
import { autonomyPrompt, autonomyState } from "../lib/autonomy.mts";
import { faults } from "../lib/shared/fault.mts";
import { fieldsOf } from "../lib/shared/fields.mts";
import { hookInput } from "../lib/shared/hook-input.mts";

const OFF =
	"Autonomy is off for this session: any autonomy instructions earlier in the conversation, the summary included, no longer apply.";

const COMPACT_FAULTS = faults(
	"den",
	"The session is not told after this compaction whether autonomy is on",
);

/** What the context gets for `session`; null for nothing. */
function context(session: string): string | null {
	const state = autonomyState(session);

	if (state === null) {
		return null;
	}

	return state === "on" ? autonomyPrompt() : OFF;
}

const input = fieldsOf(await hookInput());

let output: Record<string, unknown> | null;

try {
	// A resumed session's transcript still holds whatever autonomy last said,
	// so only a compaction leaves the context needing to be told again.
	const text =
		input["source"] === "compact"
			? context(String(input["session_id"] ?? ""))
			: null;

	output =
		text === null
			? null
			: {
					hookSpecificOutput: {
						hookEventName: "SessionStart",
						additionalContext: text,
					},
				};
} catch (error) {
	output = { systemMessage: COMPACT_FAULTS.internalFault(error).message };
}

if (output !== null) {
	process.stdout.write(JSON.stringify(output));
}
