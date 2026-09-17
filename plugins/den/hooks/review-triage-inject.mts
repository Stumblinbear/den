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
// and who, then the triage rules in brief. The rules live in full in the lead
// skill's Review section, which the reminder names because it fires many turns
// after that skill was loaded.
function reminder(pending: readonly Flag[]): string {
	const named = who(pending);

	return [
		`${pending.length} review agent(s) completed${named ? ` (${named})` : ""}.`,
		"They ran inside a `den:review-and-fix` run, and its return holds what is",
		"yours: triage every item it holds under the lead skill's review rules,",
		"each with your call and its reason, read against the task's goal, one",
		"paragraph an item, and put the user's items to them. What changes the",
		"tree goes to one fixer in one brief, and a brief carries the reviewer's",
		"repair only once you have traced it. Findings the run fixed and closed",
		"take no call. Triage `carried` as an implementer's report. Each item is",
		"classed by whether a reader could take it either way, not by its size.",
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
