// The compaction above the cached stretch: what it left behind, and which of
// the prompts above its boundary it kept verbatim.
//
// Its own subject because it is read backward through three kinds of entry
// (the summary at the end of the file, the boundary itself, and the entries
// the boundary names), and because what it prices is not what the cached
// prompts below it are priced by. The first request after a compaction wrote
// everything it kept to the cache in one piece, so a rewind anywhere in that
// stretch is a write of at most what the compaction left behind, the same
// price for all of them.
import { eligible, openingWords } from "./rewind-picker.mts";
import { fieldsOf } from "./shared/fields.mts";
import { isCompaction } from "./transcript.mts";

/**
 * Which of the operations that write a compaction boundary wrote one, and so
 * what the context it left behind is evidence of. `/compact` and auto-compact
 * summarize down to a tail Claude Code sizes, so what one of them left is the
 * best guide there is to what the next will leave. A rewind summarize keeps
 * the stretch the user picked out of the picker, which is any size at all and
 * says nothing about a tail.
 */
export type Summarize = "compact" | "rewind";

/** What a compaction left behind, and the prompts it kept above its boundary. */
export interface Compaction {
	readonly at: Date;
	readonly postTokens: number;
	/** Which one wrote it, and so what `postTokens` may be quoted as. */
	readonly summarize: Summarize;
	/** The prompts it kept verbatim, oldest first. Empty when it kept none. */
	readonly kept: readonly string[];
}

/** A boundary part-read: what it left behind, and the entries still to find. */
interface Boundary {
	readonly at: Date;
	readonly postTokens: number;
	/**
	 * Whether the summary was written after the last entry there was, rather
	 * than spliced in above the stretch it kept.
	 */
	readonly appended: boolean;
	readonly kept: string[];
	readonly pending: Set<unknown>;
	/**
	 * Whether there is conversation above the stretch it kept, which is what
	 * makes that stretch a tail. Read from the nearest message above that
	 * stretch rather than the nearest entry: every transcript opens with queue
	 * operations, settings, mode changes and attachments above its first
	 * prompt, and none of those is conversation. False until the walk has found
	 * that message, so a walk that ran out of file first leaves it false.
	 */
	conversationAbove: boolean;
}

/** The boundary read one entry at a time, walking backward from the summary. */
export interface BoundaryReader {
	/**
	 * Takes the next entry up. True once there is nothing above worth reading:
	 * the nearest message above everything the boundary kept, or an entry that
	 * says there is no boundary here.
	 */
	take(entry: Record<string, unknown>): boolean;
	/** What it read, or null where it found no boundary to read. */
	read(): Compaction | null;
}

export function boundaryReader(): BoundaryReader {
	let boundary: Boundary | null = null;

	return {
		take: (entry) => {
			if (boundary === null) {
				boundary = boundaryDetail(entry);

				if (boundary === null) {
					// The summary entry sits between the end of the file and the
					// boundary it belongs to; anything else means there is no
					// boundary to read.
					return entry["isCompactSummary"] !== true;
				}

				// A boundary that kept nothing verbatim leaves no stretch to ask
				// where it began, so there is nothing above worth walking to.
				return boundary.pending.size === 0;
			}

			if (boundary.pending.size > 0) {
				// All priced alike by what the compaction left behind, so there
				// is nothing to keep about one of them but its words.
				if (boundary.pending.delete(entry["uuid"]) && eligible(entry)) {
					boundary.kept.push(openingWords(entry));
				}

				// Even the last of them leaves the walk something to read: the
				// nearest message above it, which says whether the stretch opens
				// the conversation.
				return false;
			}

			if (!isMessage(entry) && !isCompaction(entry)) {
				return false;
			}

			boundary.conversationAbove = !isCompaction(entry);

			return true;
		},
		read: () =>
			boundary === null
				? null
				: {
						at: boundary.at,
						postTokens: boundary.postTokens,
						summarize: summarizedBy(boundary),
						// Pushed newest first, walking backward.
						kept: [...boundary.kept].reverse(),
					},
	};
}

/**
 * What a compaction boundary says about itself, or null for an entry that is
 * not one, or one too old to carry the metadata. `postTokens` is the context
 * it left behind, and `preservedMessages.uuids` names the entries above it
 * that it kept verbatim, which is what makes them readable at all: they stay
 * where they are in the file rather than being rewritten below the boundary.
 *
 * `preservedSegment.tailUuid` is the last of those entries and
 * `logicalParentUuid` is the entry the summary carries on from, so the two
 * being the same means the summary was written after the end of that stretch.
 */
function boundaryDetail(entry: Record<string, unknown>): Boundary | null {
	if (entry["type"] !== "system" || entry["subtype"] !== "compact_boundary") {
		return null;
	}

	const meta = fieldsOf(entry["compactMetadata"]);
	const postTokens = meta["postTokens"];
	const at = new Date(String(entry["timestamp"]));

	if (typeof postTokens !== "number" || Number.isNaN(at.getTime())) {
		return null;
	}

	const uuids = fieldsOf(meta["preservedMessages"])["uuids"];
	const tail = fieldsOf(meta["preservedSegment"])["tailUuid"];

	return {
		at,
		postTokens,
		appended: typeof tail === "string" && tail === entry["logicalParentUuid"],
		kept: [],
		pending: new Set<unknown>(Array.isArray(uuids) ? uuids : []),
		conversationAbove: false,
	};
}

/** An entry of the conversation, as against the record kept around it. */
const isMessage = (entry: Record<string, unknown>): boolean =>
	entry["type"] === "user" || entry["type"] === "assistant";

/**
 * Which operation wrote the boundary, from the two things about its shape that
 * separate them. `trigger` settles nothing: `/compact` and both rewind
 * directions all say "manual", and only auto-compact says "auto".
 *
 * A compaction summarizes the conversation as it stands and keeps a recent
 * tail of it: the summary goes after the last entry there was, and there is
 * conversation above the stretch it kept. "Summarize up to here" splices its
 * summary in above the stretch the user rewound to, which fails the first;
 * "summarize from here" keeps everything before the prompt instead, so the
 * stretch it kept opens the context and it fails the second. Both of those
 * kept what the user chose, which is any size at all.
 *
 * Only a boundary that passes both is quoted as a measurement, so a version
 * that writes too little for the walk to judge falls the same way the two
 * rewinds do: an entry that says nothing licenses nothing.
 */
const summarizedBy = (boundary: Boundary): Summarize =>
	boundary.appended && boundary.conversationAbove ? "compact" : "rewind";
