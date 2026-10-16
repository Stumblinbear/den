// The PreToolUse hook of the review-triage relay: a quality reviewer's
// hand-back leaves a flag for `review-triage-inject` to announce. See
// `lib/relay.mts` for when a hand-back fires it.

import { raiseFlag, reviewTriageDir } from "../lib/relay.mts";
import { hookInput } from "../lib/shared/hook-input.mts";

// `review-triage-inject` calls every flag a quality review, so only quality
// reviewers belong here. Every agent's hand-back reaches this hook; see
// `raiseFlag`.
const QUALITY_REVIEWERS: ReadonlySet<string> = new Set([
	"den:quality-reviewer",
]);

try {
	const input = await hookInput();
	const dir = input === null ? null : reviewTriageDir(input);

	if (input !== null && dir !== null) {
		raiseFlag(dir, input, QUALITY_REVIEWERS);
	}
} catch {
	// Never fail loudly; see the header of `lib/relay.mts`.
}
