// Background work the conversation is still waiting on: the subagents,
// commands and workflows it sent to the background and has not yet been told
// are done.
//
// `pending` answers that for a run of transcript entries, and `pendingReader`
// is the same walk one entry at a time, for a caller already reading the
// transcript for something else. Both ends of a piece of work are read off the
// transcript: the record Claude Code keeps beside the tool result of whatever
// sent it away names the task, and `taskNotification` reads the message that
// says it is done.
//
// The records and the carriers are the ones Claude Code 2.1.269 writes and
// not a documented interface, so a release can change them under this file.
import { fieldsOf } from "./shared/fields.mts";
import { textIn } from "./transcript.mts";

/** What was sent to the background: a subagent, a Bash command, or a workflow. */
export type LaunchKind = "agent" | "bash" | "workflow";

/** One piece of work sent to the background. */
export interface Launch {
	/** How the transcript names it, in its launch and in the end that closes it. */
	readonly id: string;
	readonly kind: LaunchKind;
}

/**
 * The pending work read one entry at a time, newest first, as
 * `contextEntries` yields them, so that every end is read ahead of the launch
 * it ends.
 */
export interface PendingReader {
	/** Takes the next entry down. */
	take(entry: Record<string, unknown>): void;
	/**
	 * The work still in the background, oldest launch first. A task
	 * notification ends a launch, and so does a `TaskStop` on it.
	 */
	read(): readonly Launch[];
}

// The tag is what marks a notification in all three carriers. The `origin` the
// harness stamps marks only the user entry, so a reader that went by it would
// miss every notification that arrived mid-turn.
const NOTIFICATION =
	/<task-notification>[\s\S]*?<task-id>\s*([A-Za-z0-9_-]+)\s*<\/task-id>/;

/** A reader with nothing taken yet. */
export function pendingReader(): PendingReader {
	const ended = new Set<string>();
	// Keyed by id, so a task launched and resumed, or resumed twice, is one
	// piece of work: every record names the same id, and one notification ends
	// them all. Each record moves the id to the end of the map, so it lands at
	// its oldest record's position, the launch, rather than at a resume.
	const launches = new Map<string, Launch>();

	return {
		take: (entry) => {
			const end = taskNotification(entry) ?? stoppedTask(entry);

			if (end !== null) {
				ended.add(end);

				return;
			}

			const launch = launchIn(entry);

			if (launch !== null && !ended.has(launch.id)) {
				launches.delete(launch.id);
				launches.set(launch.id, launch);
			}
		},
		// Inserted newest first, walking backward.
		read: () => [...launches.values()].reverse(),
	};
}

/** The work still in the background among `entries`, given newest first. */
export function pending(
	entries: Iterable<Record<string, unknown>>,
): readonly Launch[] {
	const reader = pendingReader();

	for (const entry of entries) {
		reader.take(entry);
	}

	return reader.read();
}

/**
 * The id a task notification names, whichever of its three carriers the entry
 * is, and null for an entry that is none of them.
 */
export function taskNotification(
	entry: Record<string, unknown>,
): string | null {
	const text = notificationText(entry);

	return text === null ? null : (text.match(NOTIFICATION)?.[1] ?? null);
}

/** Where each carrier keeps the notification's text, and null for the rest. */
function notificationText(entry: Record<string, unknown>): string | null {
	switch (entry["type"]) {
		case "user":
			return textIn(fieldsOf(entry["message"])["content"]);
		// A notification that arrives mid-turn leaves these two entries, the
		// enqueue and the rendering, and no user entry at all: a reader of user
		// entries alone would carry its launch as pending for the rest of the
		// context.
		case "queue-operation":
			return entry["operation"] === "enqueue"
				? String(entry["content"] ?? "")
				: null;
		case "attachment": {
			const attachment = fieldsOf(entry["attachment"]);

			return attachment["type"] === "queued_command"
				? String(attachment["prompt"] ?? "")
				: null;
		}
		default:
			return null;
	}
}

/**
 * The task a `TaskStop` call's record names, and null for the record of
 * anything else. A command stopped that way never notifies, so the stop is the
 * only end it has; an agent stopped that way notifies as well, and reading the
 * stop for both is one rule rather than two. A stop that was refused writes a
 * bare string in place of the record, so it ends nothing: the task it named
 * may still be running.
 */
function stoppedTask(entry: Record<string, unknown>): string | null {
	const record = fieldsOf(entry["toolUseResult"]);

	// `task_id` alone is also a field of the calls the task list takes, so the
	// type beside it is what tells a stop from those.
	return typeof record["task_type"] === "string"
		? idIn(record, "task_id")
		: null;
}

/**
 * The launch an entry's record describes, and null for the record of anything
 * else. A skill forked into the background counts as the agent it runs in, a
 * message to a finished agent resumes it, and a Bash command moved to the
 * background after it outgrew its timeout counts as one started there.
 */
function launchIn(entry: Record<string, unknown>): Launch | null {
	// The record Claude Code wrote for a launch, never the result's text: a
	// transcript quoted into a tool result carries another session's launch
	// lines, and a launch read from one of those is work no notification can
	// ever end. A `tool_use` with `run_in_background` set is no launch either;
	// it names no id.
	const record = fieldsOf(entry["toolUseResult"]);
	const status = record["status"];
	const agent = idIn(record, "agentId");

	if (agent !== null && (status === "async_launched" || status === "forked")) {
		return { id: agent, kind: "agent" };
	}

	const resumed = idIn(record, "resumedAgentId");

	if (resumed !== null) {
		return { id: resumed, kind: "agent" };
	}

	const command = idIn(record, "backgroundTaskId");

	if (command !== null) {
		return { id: command, kind: "bash" };
	}

	const task = idIn(record, "taskId");

	if (
		task !== null &&
		status === "async_launched" &&
		record["taskType"] === "local_workflow"
	) {
		return { id: task, kind: "workflow" };
	}

	return null;
}

/** The id a record's field names, and null for a field absent or empty. */
function idIn(record: Record<string, unknown>, key: string): string | null {
	const value = record[key];

	return typeof value === "string" && value !== "" ? value : null;
}
