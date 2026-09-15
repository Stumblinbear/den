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
// they were and who, then the triage rules in brief. The rules live in full in
// the lead skill's Implementer reports section, which the reminder names
// because it fires many turns after that skill was loaded.
function reminder(pending: readonly Flag[]): string {
	const named = who(pending);

	return [
		`${pending.length} implementer agent(s) reported finishing${named ? ` (${named})` : ""}.`,
		"Triage each report under the lead skill's implementer report",
		"rules: every declared choice, question back, deviation from the brief or",
		"instruction and left-undone item reaches the user with your accept,",
		"answer, send back or defer call and its reason, read against the task's",
		"goal, one paragraph an item. A fixer inside a `den:review-and-fix` run",
		"reports into the run: the Opus fixer's questions come back at the `fix`",
		"stop, a haiku fixer's go to the Opus fixer, and contested findings come",
		"back at the `contested` stop, each answered under its id,",
		"and the rest reach you in `carried` on the run's next return, stopped or",
		"final, triaged before any relaunch, which drops it; a send-back goes to a",
		"standing implementer after the run returns, since the fixer cannot be",
		"resumed. From an",
		"implementer or fork launched through the Agent tool, what contradicts the",
		"brief or instruction goes back at once, to the agent that made it or a",
		"standing implementer, on the route the user chooses where the round",
		"carries a question. Each item is classed by whether a reader could take",
		"it either way, not by its size.",
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
