// UserPromptSubmit half of the review-triage relay: every flag
// `review-triage-flag` left becomes one reminder to triage what the reviewers
// found, and the files it read are deleted.

import {
	type Flag,
	inject,
	reviewTriageDir,
	takeFlags,
	who,
} from "../lib/relay.mts";
import { hookInput } from "../lib/shared/hook-input.mts";

// A pointer, not a restatement: the rules live in the lead skill's
// Review section, and this fires many turns after that skill was loaded.
function reminder(pending: readonly Flag[]): string {
	const named = who(pending);

	return [
		`${pending.length} review agent(s) completed${named ? ` (${named})` : ""}.`,
		"Triage their findings and unresolved questions under the lead",
		"skill's review rules: every finding reaches the user with your fix,",
		"defer or skip call and its",
		"reasoning, explained for someone who has not read the code; what is",
		"unquestionably wrong goes back to its agent as the defect, not the",
		"reviewer's repair. Keep unanswered questions and NEEDS-DECISION verdicts",
		"unresolved.",
	].join(" ");
}

// The session id is the one thing read from the input: it names the flags
// that are this session's to announce.
const input = await hookInput();
const dir = input === null ? null : reviewTriageDir(input);
const pending = dir === null ? [] : takeFlags(dir);

if (pending.length > 0) {
	inject(reminder(pending));
}
