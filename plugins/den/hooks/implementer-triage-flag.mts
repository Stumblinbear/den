// SubagentStop half of the implementer-triage relay: a finished implementer
// leaves a flag, and nothing else. `implementer-triage-inject` does the
// injecting.
//
// The failure it closes: the lead absorbs an implementer's declared
// choices, questions and loose ends instead of putting them to the user, whose
// decisions they were.
//
// Which agents reach here is the matcher's decision in `hooks.json`: the
// implementers and Claude Code's built-in `fork` type, which is how coupled
// implementation runs under the lead rules.
import { IMPLEMENTER_TRIAGE_DIR, raiseFlag } from "../lib/relay.mts";
import { hookInput } from "../lib/shared/hook-input.mts";

try {
	const input = await hookInput();

	if (input !== null) {
		raiseFlag(IMPLEMENTER_TRIAGE_DIR, input);
	}
} catch {
	// Never fail loudly: a broken flag write must not block the subagent.
}
