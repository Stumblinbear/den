// UserPromptSubmit half of the review-triage relay: every flag
// `review-triage-flag` left becomes one reminder to triage what the reviewers
// found, and the files it read are deleted.
import { stdinText } from "../lib/hook-input.mts";
import {
	type Flag,
	inject,
	REVIEW_TRIAGE_DIR,
	takeFlags,
	who,
} from "./relay.mts";

function reminder(pending: readonly Flag[]): string {
	const named = who(pending);

	return [
		`${pending.length} review agent(s) completed${named ? ` (${named})` : ""}.`,
		"Reviewers surface every finding they can; deciding what actually gets fixed",
		"is the coordinating session's judgment, not theirs. Relay every finding to",
		"the user (guidance on fix/defer decisions, never license to omit or soften a",
		"finding), pair each with your own fix/defer/skip recommendation and the",
		"reasoning behind it, and weigh each finding's real-world impact against the",
		"cost and risk of addressing it now.",
		"Explain each finding in plain concrete language: set the scene first (what",
		"is on screen or in play, what changes, what goes observably wrong) before",
		"naming any mechanism, and write for a reader who has not read the code --",
		"translate the reviewer's jargon, never relay it.",
		"Filter test-gap findings through the discrimination bar before recommending",
		"them: a proposed test must catch a bug class that survives direct code",
		"reading -- trivial pure-function boundary tests and tests of",
		"visibly-single-path plumbing get a skip recommendation, not a fix.",
	].join(" ");
}

// Drained and discarded: nothing in it decides whether to inject, and input
// that will not parse is still input this hook has no reason to fail over.
await stdinText();

const pending = takeFlags(REVIEW_TRIAGE_DIR);

if (pending.length > 0) {
	inject(reminder(pending));
}
