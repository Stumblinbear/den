// SubagentStop half of the implementer-triage relay: a finished implementer
// leaves a flag, and nothing else. `implementer-triage-inject` does the
// injecting, and its reminder is what puts an implementer's declared choices,
// questions and loose ends to the user, whose decisions they are.
//
// Which agents reach here is the matcher's decision in `hooks.json`: the
// implementers and Claude Code's built-in `fork` type, which is how a quick
// change runs under the lead rules.
import { implementerTriageDir, raiseFlag } from "../lib/relay.mts";
import { hookInput } from "../lib/shared/hook-input.mts";

try {
	const input = await hookInput();
	const dir = input === null ? null : implementerTriageDir(input);

	if (input !== null && dir !== null) {
		raiseFlag(dir, input);
	}
} catch {
	// Never fail loudly: a broken flag write must not block the subagent.
}
