// Transcript entries in the shapes the hooks and the cut-point script read,
// shared by the tests that need them. Modelled on real entries: an assistant
// turn carries its usage with the ephemeral splits that record the cache
// lifetime, and a prompt carries a `promptId`, an `origin` and a `timestamp`.
//
// Every time is relative to now, because every question these fixtures are
// built to ask is "how long ago". Importing this registers no test of its own.
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

export const at = (minutesAgo: number): string =>
	new Date(Date.now() - minutesAgo * MINUTE).toISOString();

/**
 * Local wall-clock, computed here rather than borrowed from the code under
 * test, so a change to how a time is formatted has to be asserted and not
 * inherited.
 */
export const hhmm = (iso: string, plus = 0): string =>
	new Date(Date.parse(iso) + plus).toTimeString().slice(0, 5);

let seq = 0;

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
}

/**
 * An assistant turn whose usage sums to `tokens`, the shape the hook measures
 * and the shape a subagent's own transcript is made of.
 */
export const assistant = (
	tokens: number,
	{ minutesAgo = 0, ttl = "1h", model = "claude-opus-5" }: TurnOptions = {},
): string =>
	JSON.stringify({
		type: "assistant",
		isSidechain: false,
		timestamp: at(minutesAgo),
		message: {
			model,
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
 * `extra` is how a test makes one the picker would refuse instead, and how it
 * gives the entry the `uuid` a compaction's preserved list names it by.
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
		promptId: `prompt-${seq++}`,
		origin: { kind: "human" },
		promptSource: "typed",
		message: { role: "user", content: text },
		...extra,
	});

/** The other user entry: a tool result, which the picker never lists. */
export const toolResult = (text: string, timestamp: string): string =>
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
	});

export interface BoundaryOptions {
	readonly minutesAgo?: number;
	/** The context the compaction left behind. */
	readonly postTokens?: number;
	/**
	 * The entries above the boundary it kept verbatim, by `uuid`. A rewind at
	 * any of them costs what the compaction left behind, which is why the scan
	 * reads past the boundary.
	 */
	readonly kept?: readonly string[];
}

/**
 * What `/compact`, auto-compact and a rewind summarize all append: a boundary
 * entry and a summary entry, with no assistant entry after them.
 */
export const compactBoundary = ({
	minutesAgo = 0,
	postTokens = 11304,
	kept = [],
}: BoundaryOptions = {}): string =>
	JSON.stringify({
		type: "system",
		subtype: "compact_boundary",
		content: "Conversation compacted",
		level: "info",
		timestamp: at(minutesAgo),
		compactMetadata: {
			trigger: "manual",
			preTokens: 260000,
			postTokens,
			preservedSegment: { headUuid: kept[0], tailUuid: kept[kept.length - 1] },
			preservedMessages: { uuids: kept, allUuids: kept },
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
 * measured or priced against.
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
