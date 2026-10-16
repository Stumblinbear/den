// Claude Code's task notification, read from the prompt it arrives as:
// `completedWorkflow` names the workflow a notification reports completed.
//
// A workflow's notification fires UserPromptSubmit with the notification itself
// as `prompt`, whether it takes a turn of its own or is absorbed into one
// already running. Its head, as Claude Code 2.1.301 writes it for a completed
// workflow:
//
//   <task-notification>
//   <task-id>…</task-id>
//   <tool-use-id>…</tool-use-id>
//   <output-file>…</output-file>
//   <status>completed</status>
//   <summary>Dynamic workflow "<description>" completed</summary>
//   <result>…

/** A workflow that ran to completion, named by its `meta.description`. */
export interface CompletedWorkflow {
	readonly description: string;
}

/** A task notification whose head this reader could not make out. */
export interface UnreadableNotification {
	/** What was missing or out of shape, for the user to read. */
	readonly fault: string;
	/** The notification before its `<result>`, with its entities decoded. */
	readonly head: string;
}

const NOTIFICATION = "<task-notification>";

const COMPLETED_WORKFLOW = /^Dynamic workflow "(.*)" completed$/;

/**
 * The completed workflow a task notification in `prompt` announces.
 *
 * @remarks
 * Only the head before `<result>` is read, since the result is the workflow's
 * own return and can hold any text.
 *
 * @returns the workflow; null for a prompt that is no task notification, and
 * for a status other than `completed`, since a run that failed or was stopped
 * ended without a return; an unreadable notification when the head lacks a
 * status or a summary, or its summary reports some other completion than a
 * workflow's
 */
export function completedWorkflow(
	prompt: string,
): CompletedWorkflow | UnreadableNotification | null {
	const text = prompt.trimStart();

	if (!text.startsWith(NOTIFICATION)) {
		return null;
	}

	// Claude Code escapes `&`, `<` and `>` in a notification's text, so elements
	// are found in the escaped head and decoded one by one: a `<` decoded first
	// would end an element's text early.
	const resultAt = text.indexOf("<result>");
	const escaped = resultAt === -1 ? text : text.slice(0, resultAt);
	const head = decodeEntities(escaped);
	const status = element(escaped, "status");

	if (status === null) {
		return { fault: "the task notification has no <status>", head };
	}

	if (status !== "completed") {
		return null;
	}

	const summary = element(escaped, "summary");

	if (summary === null) {
		return { fault: "the task notification has no <summary>", head };
	}

	const workflow = COMPLETED_WORKFLOW.exec(summary);

	return workflow?.[1] === undefined
		? { fault: `the summary is not a completed workflow's: ${summary}`, head }
		: { description: workflow[1] };
}

/**
 * The trimmed text of the first `<name>` element in an escaped `head`, its
 * entities decoded, or null.
 */
function element(head: string, name: string): string | null {
	const match = new RegExp(`<${name}>([^<]*)</${name}>`).exec(head);

	return match?.[1] === undefined ? null : decodeEntities(match[1].trim());
}

const ENTITIES: Readonly<Record<string, string>> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
};

/**
 * `text` with XML's five predefined entities decoded once: `&amp;lt;` reads
 * `&lt;`, never `<`.
 */
const decodeEntities = (text: string): string =>
	text.replace(
		/&(amp|lt|gt|quot|apos);/g,
		(_, name: string) => ENTITIES[name] ?? "",
	);
