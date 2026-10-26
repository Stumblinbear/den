// The UserPromptSubmit hook of the review-triage relay: it reminds the lead to
// triage a quality review when the prompt delivers the hand-back
// `review-triage-flag` flagged, and when it delivers the return of one of den's
// review workflows.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { subagentHandBack } from "../lib/hand-back.mts";
import { type PromptOutput, writePromptOutput } from "../lib/prompt-output.mts";
import { reviewTriageDir, TRIAGE_CALL_RULE, takeFlag } from "../lib/relay.mts";
import { type Faults, faults } from "../lib/shared/fault.mts";
import { errorMessage, fieldsOf } from "../lib/shared/fields.mts";
import { hookInput } from "../lib/shared/hook-input.mts";
import { completedWorkflow } from "../lib/task-notification.mts";

// An unreadable hand-back is den's own fault, so `internal`; see
// `UnreadableHandBack`.
const HAND_BACK_FAULTS = faults(
	"den",
	"A quality review's hand-back gets no triage reminder while this stands",
);

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

/** A den review workflow whose return this hook reminds the lead to triage. */
interface ReviewWorkflow {
	/** The workflow as a fault line names it. */
	readonly name: string;
	/** The path of the shipped workflow file. */
	readonly file: string;
	readonly reminder: string;
	/** Builds this workflow's fault lines, each naming the reminder it costs. */
	readonly faults: Faults;
}

const reviewWorkflow = (
	name: string,
	file: string,
	reminder: string,
): ReviewWorkflow => ({
	name,
	file: fileURLToPath(new URL(`../workflows/${file}`, import.meta.url)),
	reminder,
	faults: faults(
		"den",
		`A ${name} return gets no triage reminder while this stands`,
	),
});

const REVIEW_WORKFLOWS: readonly ReviewWorkflow[] = [
	reviewWorkflow(
		"review-and-fix",
		"review-and-fix-workflow.js",
		IN_RUN_REMINDER,
	),
	reviewWorkflow(
		"quality review",
		"quality-review-workflow.js",
		QUALITY_REMINDER,
	),
];

/**
 * The line the user reads for a fault in `workflow` over `detail`.
 *
 * @remarks
 * Every such fault is den's own, in its shipped workflow file or in its reading
 * of a notification Claude Code reshaped, so it is `internal` and the fix is to
 * report it.
 */
const faultLine = (
	workflow: ReviewWorkflow,
	detail: string,
	cause?: unknown,
): string =>
	workflow.faults.internalFault(new Error(detail, { cause })).message;

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
 * The description `workflow` declares in its `meta`, which its task
 * notification names it by.
 *
 * @remarks
 * Read from the workflow file, the one home of that text: the `meta` is a
 * literal the host reads, so the workflow can import nothing to share it. The
 * meta's `description:` must be the first in the file, written as a quoted
 * string with no escapes in it.
 *
 * @throws when the file cannot be read, or holds no quoted `description:`
 */
function workflowDescription(workflow: ReviewWorkflow): string {
	const source = readFileSync(workflow.file, "utf8");
	const found = /\bdescription:\s*(['"])(.*?)\1/.exec(source);

	if (found?.[2] === undefined) {
		throw new Error("it declares no `description:`");
	}

	return found[2];
}

// What a return of `workflow` in `prompt` has for the lead or the user, and
// nothing for any other prompt. A return needs no flag, since its task
// notification is the prompt; see the header of `lib/task-notification.mts`.
function workflowReturn(
	workflow: ReviewWorkflow,
	prompt: string,
): PromptOutput {
	const notification = completedWorkflow(prompt);

	if (notification === null) {
		return {};
	}

	let description: string;

	try {
		description = workflowDescription(workflow);
	} catch (error) {
		return {
			fault: faultLine(
				workflow,
				`could not read the ${workflow.name} workflow's description from ${workflow.file} (${errorMessage(error)})`,
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
						workflow,
						`a ${workflow.name} return's task notification could not be read (${notification.fault}); Claude Code may have changed its shape`,
					),
				}
			: {};
	}

	return notification.description === description
		? { reminder: workflow.reminder }
		: {};
}

const input = await hookInput();
const dir = input === null ? null : reviewTriageDir(input);
const prompt = fieldsOf(input)["prompt"];
const outputs =
	typeof prompt === "string"
		? [
				dir === null ? {} : qualityReview(dir, prompt),
				...REVIEW_WORKFLOWS.map((workflow) => workflowReturn(workflow, prompt)),
			]
		: [];
const reminders = outputs.flatMap((output) => output.reminder ?? []);
const faultLines = outputs.flatMap((output) => output.fault ?? []);

writePromptOutput({
	...(reminders.length > 0 ? { reminder: reminders.join(" ") } : {}),
	...(faultLines.length > 0 ? { fault: faultLines.join(" ") } : {}),
});
