// The UserPromptSubmit hook of the review-triage relay: it reminds the lead to
// triage a quality review when the prompt delivers the hand-back
// `review-triage-flag` flagged, and each `den:review-and-fix` return.
//
// A review-and-fix return needs no flag: its task notification is the prompt
// this hook reads (see `lib/task-notification.mts`), so the reminder rides on
// the turn the return arrives with.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { subagentHandBack } from "../lib/hand-back.mts";
import { type PromptOutput, writePromptOutput } from "../lib/prompt-output.mts";
import { reviewTriageDir, TRIAGE_CALL_RULE, takeFlag } from "../lib/relay.mts";
import { faults } from "../lib/shared/fault.mts";
import { errorMessage, fieldsOf } from "../lib/shared/fields.mts";
import { hookInput } from "../lib/shared/hook-input.mts";
import { completedWorkflow } from "../lib/task-notification.mts";

const REVIEW_AND_FIX = fileURLToPath(
	new URL("../workflows/review-and-fix-workflow.js", import.meta.url),
);

// A review-and-fix fault is den's own, not the user's: its shipped workflow
// file, or its reading of a notification Claude Code reshaped. So each is
// `internal`, and the fix is to report it.
const REVIEW_AND_FIX_FAULTS = faults(
	"den",
	"A review-and-fix return gets no triage reminder while this stands",
);

// An unreadable hand-back is den's own fault, so `internal`; see
// `UnreadableHandBack`.
const HAND_BACK_FAULTS = faults(
	"den",
	"A quality review's hand-back gets no triage reminder while this stands",
);

/** The line the user reads for den's own fault over `detail`. */
const faultLine = (detail: string, cause?: unknown): string =>
	REVIEW_AND_FIX_FAULTS.internalFault(new Error(detail, { cause })).message;

// Each reminder names the triage skill and none of its rules; see the header
// of `lib/relay.mts`.
const IN_RUN_REMINDER = [
	"If the `den:review-and-fix` return holds anything to rule on, any finding or carried item, invoke `den:triage` and triage every one.",
	TRIAGE_CALL_RULE,
].join(" ");

const QUALITY_REMINDER = [
	"A quality review completed.",
	"If it raised findings, invoke `den:triage` and triage every finding in each report.",
	TRIAGE_CALL_RULE,
].join(" ");

// What a quality reviewer's hand-back in `prompt` has for the lead or the user,
// taking the reviewer's flag; nothing for any other prompt.
function qualityReview(dir: string, prompt: string): PromptOutput {
	const handBack = subagentHandBack(prompt);

	if (handBack === null) {
		return {};
	}

	if ("fault" in handBack) {
		return {
			fault: HAND_BACK_FAULTS.internalFault(new Error(handBack.fault)).message,
		};
	}

	return takeFlag(dir, handBack.sender) === null
		? {}
		: { reminder: QUALITY_REMINDER };
}

/**
 * The description the review-and-fix workflow declares in its `meta`, which
 * its task notification names it by.
 *
 * @remarks
 * Read from the workflow file, the one home of that text: the `meta` is a
 * literal the host reads, so the workflow can import nothing to share it. The
 * workflow must write `description:` first in the file, as a quoted string
 * with no escapes in it.
 *
 * @throws when the file cannot be read, or holds no quoted `description:`
 */
function reviewAndFixDescription(): string {
	const source = readFileSync(REVIEW_AND_FIX, "utf8");
	const found = /\bdescription:\s*(['"])(.*?)\1/.exec(source);

	if (found?.[2] === undefined) {
		throw new Error("it declares no `description:`");
	}

	return found[2];
}

// What a review-and-fix return in `prompt` has for the lead or the user, and
// nothing for any other prompt.
function reviewAndFixReturn(prompt: string): PromptOutput {
	const notification = completedWorkflow(prompt);

	if (notification === null) {
		return {};
	}

	let description: string;

	try {
		description = reviewAndFixDescription();
	} catch (error) {
		return {
			fault: faultLine(
				`could not read the review-and-fix workflow's description from ${REVIEW_AND_FIX} (${errorMessage(error)})`,
				error,
			),
		};
	}

	if ("fault" in notification) {
		// Another workflow's notification is not this hook's to report, however
		// it reads.
		return notification.head.includes(description)
			? {
					fault: faultLine(
						`a review-and-fix return's task notification could not be read (${notification.fault}); Claude Code may have changed its shape`,
					),
				}
			: {};
	}

	return notification.description === description
		? { reminder: IN_RUN_REMINDER }
		: {};
}

const input = await hookInput();
const dir = input === null ? null : reviewTriageDir(input);
const prompt = fieldsOf(input)["prompt"];
const outputs =
	typeof prompt === "string"
		? [
				dir === null ? {} : qualityReview(dir, prompt),
				reviewAndFixReturn(prompt),
			]
		: [];
const reminders = outputs.flatMap((output) => output.reminder ?? []);
const faultLines = outputs.flatMap((output) => output.fault ?? []);

writePromptOutput({
	...(reminders.length > 0 ? { reminder: reminders.join(" ") } : {}),
	...(faultLines.length > 0 ? { fault: faultLines.join(" ") } : {}),
});
