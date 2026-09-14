// Transcript entries in the shapes the hooks read, shared by the tests that
// need them. Modelled on real entries: an assistant turn carries its usage with
// the ephemeral splits that record the cache lifetime, and a prompt carries a
// `promptId`, an `origin` and a `timestamp`.
//
// Every time is relative to now, because every question these fixtures are
// built to ask is "how long ago". Importing this registers no test of its own.
export const MINUTE = 60_000;

export const at = (minutesAgo: number): string =>
	new Date(Date.now() - minutesAgo * MINUTE).toISOString();

let seq = 0;

/** One tool call in an assistant entry, as the watcher's signals read one. */
export interface ToolCall {
	readonly name: string;
	readonly input: Record<string, unknown>;
}

/** How a turn was billed, which is how the transcript records the lifetime. */
export interface TurnOptions {
	readonly minutesAgo?: number;
	/**
	 * Which ephemeral split the turn was billed under. Null is a request served
	 * entirely from the cache: it wrote nothing back, so both splits are zero
	 * and the turn says nothing about the lifetime in force.
	 */
	readonly ttl?: "5m" | "1h" | null;
	readonly model?: string;
	/** The entry's own uuid, which is how the watcher names the turn it read. */
	readonly uuid?: string;
	/** What the assistant said, which the watcher's tail carries. */
	readonly text?: string;
	/** What it called, which the watcher reads for a landing point. */
	readonly calls?: readonly ToolCall[];
	/**
	 * True for a turn that has not ended, which is what the newest turn of a
	 * transcript read mid-reply looks like: the model stopped to call a tool
	 * and the reply carries on after it.
	 */
	readonly running?: boolean;
}

/**
 * An assistant turn whose usage sums to `tokens`, the shape the hook measures
 * and the shape a subagent's own transcript is made of.
 */
export const assistant = (
	tokens: number,
	{
		minutesAgo = 0,
		ttl = "1h",
		model = "claude-opus-5",
		uuid = `assistant-${seq++}`,
		text = "",
		calls = [],
		running = false,
	}: TurnOptions = {},
): string =>
	JSON.stringify({
		type: "assistant",
		isSidechain: false,
		timestamp: at(minutesAgo),
		uuid,
		message: {
			model,
			stop_reason: running ? "tool_use" : "end_turn",
			content: [
				...(text === "" ? [] : [{ type: "text", text }]),
				...calls.map((call) => ({
					type: "tool_use",
					id: `toolu_${seq++}`,
					name: call.name,
					input: call.input,
				})),
			],
			usage: {
				input_tokens: 1000,
				cache_creation_input_tokens: ttl ? 1000 : 0,
				cache_read_input_tokens: ttl ? tokens - 2000 : tokens - 1000,
				cache_creation: {
					ephemeral_1h_input_tokens: ttl === "1h" ? 1000 : 0,
					ephemeral_5m_input_tokens: ttl === "5m" ? 1000 : 0,
				},
			},
		},
	});

/**
 * A prompt the rewind picker would list: plain-string content, a human origin.
 * `extra` is how a test makes one the picker would refuse instead.
 */
export const prompt = (
	text: string,
	timestamp: string,
	extra: Readonly<Record<string, unknown>> = {},
): string =>
	JSON.stringify({
		type: "user",
		isSidechain: false,
		timestamp,
		uuid: `prompt-${seq}`,
		promptId: `prompt-${seq++}`,
		origin: { kind: "human" },
		promptSource: "typed",
		message: { role: "user", content: text },
		...extra,
	});

/**
 * The other user entry: a tool result, which the picker never lists. `extra`
 * is how a test adds the fields a launch's result carries beside it.
 */
export const toolResult = (
	text: string,
	timestamp: string,
	extra: Readonly<Record<string, unknown>> = {},
): string =>
	JSON.stringify({
		type: "user",
		isSidechain: false,
		timestamp,
		message: {
			role: "user",
			content: [
				{ type: "tool_result", tool_use_id: `toolu_${seq++}`, content: text },
			],
		},
		toolUseResult: { stdout: text },
		...extra,
	});

/**
 * A message another Claude session posted into this one, in the shape Claude
 * Code 2.1.269 writes one: a user entry the user never typed, which the
 * readers here have to tell from a prompt.
 */
export const crossSessionMessage = (text: string, timestamp: string): string =>
	JSON.stringify({
		type: "user",
		isSidechain: false,
		isMeta: true,
		promptSource: "system",
		origin: {
			kind: "peer",
			from: "uds:/tmp/cc-socks/1.sock",
			msg_id: `relayed-${seq}`,
			name: "context-budget",
			body: text,
		},
		timestamp,
		uuid: `relayed-${seq++}`,
		message: {
			role: "user",
			content: `Another Claude session sent a message:\n<cross-session-message from="uds:/tmp/cc-socks/1.sock" from-name="context-budget">\n${text}\n</cross-session-message>`,
		},
	});

/**
 * The boundary entry `/compact`, auto-compact and a rewind summarize each
 * append, followed by `COMPACT_SUMMARY` and no assistant entry.
 */
export const compactBoundary = ({
	minutesAgo = 0,
}: {
	minutesAgo?: number;
} = {}): string =>
	JSON.stringify({
		type: "system",
		subtype: "compact_boundary",
		content: "Conversation compacted",
		level: "info",
		timestamp: at(minutesAgo),
		logicalParentUuid: "tail-entry",
		compactMetadata: {
			trigger: "manual",
			preTokens: 260000,
			postTokens: 11304,
			preservedSegment: { headUuid: "tail-entry", tailUuid: "tail-entry" },
			preservedMessages: { uuids: [], allUuids: [] },
		},
	});

export const COMPACT_SUMMARY = JSON.stringify({
	type: "user",
	isSidechain: false,
	isCompactSummary: true,
	message: { role: "user", content: "This session is being continued..." },
});

/**
 * A request that failed before the model ever saw it, which the harness writes
 * as an assistant entry of its own: a synthetic model id, `isApiErrorMessage`,
 * and a usage with every field zero. It carried no context, wrote nothing to
 * the cache and left no entry behind, so it is not a turn anything can be
 * measured against.
 */
export const apiError = ({
	minutesAgo = 0,
}: {
	minutesAgo?: number;
} = {}): string =>
	JSON.stringify({
		type: "assistant",
		isSidechain: false,
		timestamp: at(minutesAgo),
		message: {
			model: "<synthetic>",
			role: "assistant",
			content: [{ type: "text", text: "API Error: Request timed out." }],
			usage: {
				input_tokens: 0,
				output_tokens: 0,
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 0,
				cache_creation: {
					ephemeral_1h_input_tokens: 0,
					ephemeral_5m_input_tokens: 0,
				},
			},
		},
		isApiErrorMessage: true,
		error: "timeout",
	});
