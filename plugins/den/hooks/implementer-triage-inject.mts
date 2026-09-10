// UserPromptSubmit half of the implementer-triage relay: every flag
// `implementer-triage-flag` left becomes one reminder to triage what the
// implementers reported, and the files it read are deleted.

import {
	type Flag,
	implementerTriageDir,
	inject,
	takeFlags,
	who,
} from "../lib/relay.mts";
import { hookInput } from "../lib/shared/hook-input.mts";

// Names the lead skill's Implementer reports section, which carries
// these rules in full: the reminder fires many turns after that skill was
// loaded.
function reminder(pending: readonly Flag[]): string {
	const named = who(pending);

	return [
		`${pending.length} implementer agent(s) reported finishing${named ? ` (${named})` : ""}.`,
		"Triage each report under the lead skill's implementer report",
		"rules: every declared choice, question back, deviation from the brief or",
		"instruction and left-undone item reaches the user with your accept,",
		"answer, send back or defer call and its reasoning. What contradicts the",
		"brief goes back to its agent at once; a fork has no brief and is never",
		"resumed, so what it got wrong goes to a new fork.",
	].join(" ");
}

// The session id is the one thing read from the input: it names the flags
// that are this session's to announce.
const input = await hookInput();
const dir = input === null ? null : implementerTriageDir(input);
const pending = dir === null ? [] : takeFlags(dir);

if (pending.length > 0) {
	inject(reminder(pending));
}
