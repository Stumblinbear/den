// UserPromptSubmit half of the review-triage relay: every flag
// `review-triage-flag` left becomes one reminder to triage what the reviewers
// found, and the files it read are deleted.

import {
	type Flag,
	inject,
	REVIEW_TRIAGE_DIR,
	takeFlags,
	who,
} from "../lib/relay.mts";
import { stdinText } from "../lib/shared/hook-input.mts";

// A pointer, not a restatement: the rules live in the coordination skill's
// Review section, and this fires many turns after that skill was loaded.
function reminder(pending: readonly Flag[]): string {
	const named = who(pending);

	return [
		`${pending.length} review agent(s) completed${named ? ` (${named})` : ""}.`,
		"Triage their findings under the coordination skill's review rules: every",
		"finding reaches the user with your fix, defer or skip call and its",
		"reasoning, explained for someone who has not read the code; what is",
		"unquestionably wrong goes back to its agent as the defect, not the",
		"reviewer's repair.",
	].join(" ");
}

// Drained and discarded: nothing in it decides whether to inject, and input
// that will not parse is still input this hook has no reason to fail over.
await stdinText();

const pending = takeFlags(REVIEW_TRIAGE_DIR);

if (pending.length > 0) {
	inject(reminder(pending));
}
