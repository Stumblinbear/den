// SubagentStop half of the review-triage relay: a finished reviewer or
// closure verifier leaves a flag, and nothing else. `review-triage-inject`
// does the injecting. Which agents reach here is the matcher's decision in
// `hooks.json`: a SubagentStop matcher is applied to the agent type.

import { raiseFlag, reviewTriageDir } from "../lib/relay.mts";
import { hookInput } from "../lib/shared/hook-input.mts";

try {
	const input = await hookInput();
	const dir = input === null ? null : reviewTriageDir(input);

	if (input !== null && dir !== null) {
		raiseFlag(dir, input);
	}
} catch {
	// Never fail loudly: a broken flag write must not block the subagent.
}
