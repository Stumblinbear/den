// SubagentStop half of the implementer-triage relay: a finished implementer
// leaves a flag, and nothing else. `implementer-triage-inject` does the
// injecting.
//
// The failure it closes: the coordinator absorbs an implementer's declared
// choices, questions and loose ends instead of putting them to the user, whose
// decisions they were.
import { bareType, IMPLEMENTER_TRIAGE_DIR, raiseFlag } from "../lib/relay.mts";
import { hookInput } from "../lib/shared/hook-input.mts";

// Agents that edit the working tree and report a finished state against a
// brief, which is what there is to triage.
const IMPLEMENTERS: readonly string[] = [
	"implementer-opus",
	"implementer-haiku",
	"implementer-fable",
	"red-green-fixer",
];

try {
	const input = await hookInput();

	// Filtered here rather than on the settings matcher, which does not
	// reliably scope a SubagentStop hook: it fires for every subagent.
	if (input !== null && IMPLEMENTERS.includes(bareType(input["agent_type"]))) {
		raiseFlag(IMPLEMENTER_TRIAGE_DIR, input);
	}
} catch {
	// Never fail loudly: a broken flag write must not block the subagent.
}
