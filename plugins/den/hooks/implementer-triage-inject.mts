// UserPromptSubmit half of the implementer-triage relay: every flag
// `implementer-triage-flag` left becomes one reminder to triage what the
// implementers reported, and the files it read are deleted.

import {
	type Flag,
	IMPLEMENTER_TRIAGE_DIR,
	inject,
	takeFlags,
	who,
} from "../lib/relay.mts";
import { stdinText } from "../lib/shared/hook-input.mts";

// Names the coordination skill's Implementer reports section, which carries
// these rules in full: the reminder fires many turns after that skill was
// loaded.
function reminder(pending: readonly Flag[]): string {
	const named = who(pending);

	return [
		`${pending.length} implementer agent(s) reported finishing${named ? ` (${named})` : ""}.`,
		"Triage each report under the coordination skill's implementer report",
		"rules: every declared choice, question back, deviation from the brief and",
		"left-undone item reaches the user with your accept, answer, send back or",
		"defer call and its reasoning; what contradicts the brief goes back to its",
		"agent at once.",
	].join(" ");
}

// Drained and discarded: nothing in it decides whether to inject, and input
// that will not parse is still input this hook has no reason to fail over.
await stdinText();

const pending = takeFlags(IMPLEMENTER_TRIAGE_DIR);

if (pending.length > 0) {
	inject(reminder(pending));
}
