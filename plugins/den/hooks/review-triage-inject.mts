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

// The reminder for `pending` review agents that completed: how many they were
// and who. The rules are the triage skill's, and the reminder loads them at
// the moment they apply instead of restating them.
function reminder(pending: readonly Flag[]): string {
	const named = who(pending);

	return [
		`${pending.length} review agent(s) completed${named ? ` (${named})` : ""}.`,
		"They ran inside a `den:review-and-fix` run: when its return arrives,",
		"invoke `den:triage` and triage every item it holds.",
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
