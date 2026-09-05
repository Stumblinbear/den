// SubagentStop half of the review-triage relay: a finished flag-reviewer
// leaves a flag, and nothing else. `review-triage-inject` does the injecting.

import { bareType, REVIEW_TRIAGE_DIR, raiseFlag } from "../lib/relay.mts";
import { hookInput } from "../lib/shared/hook-input.mts";

try {
	const input = await hookInput();

	// Filtered here rather than on the settings matcher, which does not
	// reliably scope a SubagentStop hook: it fires for every subagent, so only
	// a matched reviewer type may leave a flag.
	if (input !== null && bareType(input["agent_type"]) === "flag-reviewer") {
		raiseFlag(REVIEW_TRIAGE_DIR, input);
	}
} catch {
	// Never fail loudly: a broken flag write must not block the subagent.
}
