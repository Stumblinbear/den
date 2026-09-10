// SubagentStop half of the review-triage relay: a finished reviewer or
// closure verifier leaves a flag, and nothing else. `review-triage-inject`
// does the injecting. Which agents reach here is the matcher's decision in
// `hooks.json`: a SubagentStop matcher is applied to the agent type.

import { REVIEW_TRIAGE_DIR, raiseFlag } from "../lib/relay.mts";
import { hookInput } from "../lib/shared/hook-input.mts";

try {
	const input = await hookInput();

	if (input !== null) {
		raiseFlag(REVIEW_TRIAGE_DIR, input);
	}
} catch {
	// Never fail loudly: a broken flag write must not block the subagent.
}
