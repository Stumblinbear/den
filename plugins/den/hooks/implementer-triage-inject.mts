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

// The reminder for `pending` implementers that reported finishing: how many
// they were and who. The rules are the triage skill's, and the reminder loads
// them at the moment they apply instead of restating them.
function reminder(pending: readonly Flag[]): string {
	const named = who(pending);

	return [
		`${pending.length} implementer agent(s) reported finishing${named ? ` (${named})` : ""}.`,
		"Invoke `den:triage` and triage each report.",
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
