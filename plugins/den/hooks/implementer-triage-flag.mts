// The PreToolUse hook of the implementer-triage relay: an implementer's
// hand-back leaves a flag for `implementer-triage-inject` to announce. See
// `lib/relay.mts` for when a hand-back fires it.
import { implementerTriageDir, raiseFlag } from "../lib/relay.mts";
import { hookInput } from "../lib/shared/hook-input.mts";

// Every agent's hand-back reaches this hook; see `raiseFlag`.
const IMPLEMENTERS: ReadonlySet<string> = new Set([
	"den:implementer",
	"den:implementer-low",
	"den:implementer-high",
	"den:implementer-haiku",
]);

try {
	const input = await hookInput();
	const dir = input === null ? null : implementerTriageDir(input);

	if (input !== null && dir !== null) {
		raiseFlag(dir, input, IMPLEMENTERS);
	}
} catch {
	// Never fail loudly; see the header of `lib/relay.mts`.
}
