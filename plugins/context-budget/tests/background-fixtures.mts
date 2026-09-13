// Transcript entries background work leaves behind, in the shapes Claude Code
// 2.1.269 writes them: the tool result of each launch, with the record beside
// it that names the task, and the notification that ends one. They are the
// pending-work walk's subject alone, and no pricing reader's, so they sit
// beside `fixtures.mts` rather than in it. Importing this registers no test of
// its own.

let seq = 0;

/** Anything a test adds to an entry, such as the `isSidechain` a subagent's entries carry. */
type Extra = Readonly<Record<string, unknown>>;

/**
 * The tool result an Agent launch into the background writes: the id on its
 * own line of the text, and in the record as `agentId` under `async_launched`.
 */
export const agentLaunch = (
	id: string,
	timestamp: string,
	extra: Extra = {},
): string =>
	result(
		[
			{
				type: "text",
				text: [
					"Async agent launched successfully. (This tool result is internal metadata.)",
					`agentId: ${id} (internal ID - do not mention to user.)`,
					"The agent is working in the background. You will be notified automatically when it completes.",
				].join("\n"),
			},
		],
		{
			isAsync: true,
			status: "async_launched",
			agentId: id,
			description: "Survey the plugin",
			resolvedModel: "claude-opus-5",
		},
		timestamp,
		extra,
	);

/**
 * The tool result a skill forked into the background writes: the agent it runs
 * in is named as `agentId` under `forked`, and the notification that ends it
 * names that agent.
 */
export const forkedSkill = (id: string, timestamp: string): string =>
	result(
		'Skill "den:review" launched (forked execution, running in the background).\n\nRunning in the background as @den-review',
		{
			success: true,
			commandName: "den:review",
			status: "forked",
			background: true,
			agentId: id,
			result: "Running in the background as @den-review",
		},
		timestamp,
	);

/**
 * The tool result a message to a finished background agent writes, which
 * resumes it: the record names it as `resumedAgentId`.
 */
export const agentResume = (id: string, timestamp: string): string => {
	const record = {
		success: true,
		message: `Resuming agent ${id.slice(0, 7)}`,
		resumedAgentId: id,
		pin: { id, name: id, ref: id.slice(0, 6) },
	};

	return result(
		[{ type: "text", text: JSON.stringify(record) }],
		record,
		timestamp,
	);
};

/**
 * The tool result a Bash command in the background writes: one `started`
 * there, or one `moved` there after it outgrew its timeout. Either names the
 * task as `backgroundTaskId`.
 */
export const backgroundBash = (
	id: string,
	timestamp: string,
	how: "started" | "moved" = "started",
): string =>
	result(
		how === "started"
			? `Command running in background with ID: ${id}. Output is being written to: /tmp/tasks/${id}.output. You will be notified when it completes.`
			: `Command did not complete within its 120s timeout and was moved to the background (ID: ${id}). Output is being written to: /tmp/tasks/${id}.output.`,
		{
			stdout: "",
			stderr: "",
			interrupted: false,
			isImage: false,
			noOutputExpected: false,
			backgroundTaskId: id,
			...(how === "moved" ? { timedOutAfterMs: 120_000 } : {}),
		},
		timestamp,
	);

/**
 * The tool result a workflow launch writes: the task named as `taskId` under
 * `async_launched`, with the task type that tells it from the rest.
 */
export const workflowLaunch = (id: string, timestamp: string): string =>
	result(
		`Workflow launched in background. Task ID: ${id}\nSummary: Three blind explorers propose against one design basis`,
		{ status: "async_launched", taskId: id, taskType: "local_workflow" },
		timestamp,
	);

/**
 * Where the transcript records a notification. `idle` is the user entry that
 * one arriving between turns begins, which the rewind picker refuses; `queued`
 * and `attached` are the enqueue and the rendering that one arriving mid-turn
 * leaves instead, with no user entry at all.
 */
export type Delivery = "idle" | "queued" | "attached";

/**
 * The notification that background work finished, in the shape the carrier
 * `delivery` names writes it. Every carrier names the id in the tag.
 */
export const taskNotification = (
	id: string,
	timestamp: string,
	delivery: Delivery = "idle",
): string => {
	const tag = [
		"<task-notification>",
		`<task-id>${id}</task-id>`,
		"<status>completed</status>",
		"<summary>Agent finished</summary>",
		"</task-notification>",
	].join("\n");

	switch (delivery) {
		case "idle":
			return JSON.stringify({
				type: "user",
				isSidechain: false,
				timestamp,
				uuid: `notified-${seq}`,
				promptId: `notified-${seq++}`,
				origin: { kind: "task-notification" },
				promptSource: "system",
				message: { role: "user", content: tag },
			});
		case "queued":
			return JSON.stringify({
				type: "queue-operation",
				operation: "enqueue",
				timestamp,
				sessionId: "session",
				content: tag,
			});
		case "attached":
			return JSON.stringify({
				type: "attachment",
				isSidechain: false,
				timestamp,
				uuid: `attached-${seq++}`,
				attachment: {
					type: "queued_command",
					commandMode: "task-notification",
					timestamp,
					prompt: tag,
				},
			});
	}
};

/**
 * The tool result a `TaskStop` call writes: the task it stopped named as
 * `task_id` beside its type.
 */
export const taskStop = (
	id: string,
	timestamp: string,
	taskType: "local_agent" | "local_bash" | "local_workflow" = "local_bash",
): string => {
	const record = {
		message: `Successfully stopped task: ${id} (sleep 600)`,
		task_id: id,
		task_type: taskType,
		command: "sleep 600",
	};

	return result(
		[{ type: "text", text: JSON.stringify(record) }],
		record,
		timestamp,
	);
};

/**
 * A tool result as the transcript stores one: the content the model was
 * shown, a bare string or a block list, and beside it the record the tool
 * handed the harness.
 */
const result = (
	content: unknown,
	record: Record<string, unknown>,
	timestamp: string,
	extra: Extra = {},
): string =>
	JSON.stringify({
		type: "user",
		isSidechain: false,
		timestamp,
		message: {
			role: "user",
			content: [
				{ type: "tool_result", tool_use_id: `toolu_${seq++}`, content },
			],
		},
		toolUseResult: record,
		...extra,
	});
