// The compaction above the cached stretch: what it left behind, and which of
// the prompts above its boundary it kept verbatim.
//
// Its own subject because it is read backward through three kinds of entry --
// the summary at the end of the file, the boundary itself, and the entries the
// boundary names -- and because what it prices is not what the cached prompts
// below it are priced by. The first request after a compaction wrote
// everything it kept to the cache in one piece, so a rewind anywhere in that
// stretch is a write of at most what the compaction left behind, the same
// price for all of them.
import { eligible, openingWords } from "./rewind-picker.mts";
import { fieldsOf } from "./shared/fields.mts";

/** What a compaction left behind, and the prompts it kept above its boundary. */
export interface Compaction {
	readonly at: Date;
	readonly postTokens: number;
	/** The prompts it kept verbatim, oldest first. Empty when it kept none. */
	readonly kept: readonly string[];
}

/** A boundary part-read: what it left behind, and the entries still to find. */
interface Boundary {
	readonly at: Date;
	readonly postTokens: number;
	readonly kept: string[];
	readonly pending: Set<unknown>;
}

/** The boundary read one entry at a time, walking backward from the summary. */
export interface BoundaryReader {
	/**
	 * Takes the next entry up. True once there is nothing above worth reading:
	 * every kept entry found, or an entry that says there is no boundary here.
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

				return boundary === null
					? // The summary entry sits between the end of the file and
						// the boundary it belongs to; anything else means there
						// is no boundary to read.
						entry["isCompactSummary"] !== true
					: boundary.pending.size === 0;
			}

			if (!boundary.pending.delete(entry["uuid"])) {
				return false;
			}

			// All priced alike by what the compaction left behind, so there is
			// nothing to keep about one of them but its words.
			if (eligible(entry)) {
				boundary.kept.push(openingWords(entry));
			}

			return boundary.pending.size === 0;
		},
		read: () =>
			boundary === null
				? null
				: {
						at: boundary.at,
						postTokens: boundary.postTokens,
						// Pushed newest first, walking backward.
						kept: [...boundary.kept].reverse(),
					},
	};
}

/**
 * What a compaction boundary says about itself, or null for an entry that is
 * not one, or one too old to carry the metadata. `postTokens` is the context
 * it left behind, and `preservedMessages.uuids` names the entries above it
 * that it kept verbatim -- which is what makes them readable at all, since
 * they stay where they are in the file rather than being rewritten below the
 * boundary.
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

	return {
		at,
		postTokens,
		kept: [],
		pending: new Set<unknown>(Array.isArray(uuids) ? uuids : []),
	};
}
