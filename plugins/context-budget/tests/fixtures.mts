// Transcript entries in the shapes the hooks and the cut-point script read,
// shared by the tests that need them. Modelled on real entries: an assistant
// turn carries its usage with the ephemeral splits that record the cache
// lifetime, and a prompt carries a `promptId`, an `origin` and a `timestamp`.
//
// Every time is relative to now, because every question these fixtures are
// built to ask is "how long ago". The one whole session at the end is here for
// the same reason the entries are: two files price it, and building it twice
// would let the two drift. Importing this registers no test of its own.
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

/**
 * The other user entry: a tool result, which the picker never lists. `extra`
 * is how a test gives one the `uuid` a compaction preserves it by, which is
 * most of what a compaction preserves and none of what it offers to cut at.
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
	/**
	 * Written the way "summarize up to here" writes one: the summary went in
	 * above the stretch it kept, so the boundary carries on from the entry
	 * above that stretch rather than from the end of it. `/compact` and
	 * auto-compact append theirs after the last entry there was, which is what
	 * this is false for. `trigger` says "manual" either way.
	 *
	 * The other rewind direction is no shape of this entry: "summarize from
	 * here" appends its summary too, and what marks it is that the stretch it
	 * kept opens the conversation, which a test writes by naming the first
	 * prompt of the transcript in `kept`.
	 */
	readonly splicedAbove?: boolean;
}

/**
 * What `/compact`, auto-compact and a rewind summarize all append: a boundary
 * entry and a summary entry, with no assistant entry after them.
 */
export const compactBoundary = ({
	minutesAgo = 0,
	postTokens = 11304,
	kept = [],
	splicedAbove = false,
}: BoundaryOptions = {}): string => {
	// The stretch it kept, named by its last entry. A test that names none
	// still gets a boundary whose two uuid fields agree, as a compaction's do;
	// what it does not get is an entry above that stretch for the reader to
	// walk to, so a boundary written that way measures nothing.
	const tailUuid = kept[kept.length - 1] ?? "tail-entry";

	return JSON.stringify({
		type: "system",
		subtype: "compact_boundary",
		content: "Conversation compacted",
		level: "info",
		timestamp: at(minutesAgo),
		logicalParentUuid: splicedAbove
			? "the-entry-above-the-kept-stretch"
			: tailUuid,
		compactMetadata: {
			trigger: "manual",
			preTokens: 260000,
			postTokens,
			preservedSegment: { headUuid: kept[0] ?? tailUuid, tailUuid },
			preservedMessages: { uuids: kept, allUuids: kept },
		},
	});
};

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

/** When the older of the two cut points in `CACHED_SESSION` was sent. */
export const CACHED_OPENED = at(50);

/** When the newer of them was sent. */
export const CACHED_STARTED = at(35);

/**
 * A session with those two cut points still cached and a prompt above them
 * that has gone cold, which keeps the older of the two from opening the
 * context. Its newest turn is 200K, so what a cut keeps is 200K less what it
 * summarizes away, and the reading numbers it `/compact`, the two of them, and
 * carrying on.
 *
 * Two files price it: one for the rows the cut points come to, one for the two
 * options priced around them. Building it twice would let the two drift.
 */
export const CACHED_SESSION: readonly string[] = [
	assistant(80_000, { minutesAgo: 200 }),
	prompt("The prompt from before lunch", at(190)),
	assistant(100_000, { minutesAgo: 55 }),
	prompt("Read the brief and start on the scanner", CACHED_OPENED),
	assistant(150_000, { minutesAgo: 40 }),
	prompt("Now add the skill that takes a fresh reading", CACHED_STARTED),
	assistant(200_000, { minutesAgo: 30 }),
];
