// How full the session's context is, read from the newest assistant turn in
// the transcript's tail.
import { Buffer } from "node:buffer";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { fieldsOf } from "../lib/fields.mts";
import { ifPresent, inputTokens, newestFirst } from "./transcript.mts";

// Enough to hold the newest assistant entry with room to spare: the largest
// line seen in a real transcript is ~100 KB, and an assistant entry is bounded
// by the model's output limit. A fixed tail keeps the cost of a hook that runs
// on every tool call independent of how long the session has grown.
const TAIL_BYTES = 512 * 1024;

/** The context an empty one measures as, which no threshold can be at. */
const EMPTY: Measured = { model: "", tokens: 0 };

export interface Measured {
	readonly model: string;
	readonly tokens: number;
}

/**
 * The session's current context, or null when there is nothing to measure: no
 * transcript at that path, or a tail holding no turn. Sidechain entries belong
 * to a subagent sharing the transcript, so their usage is not the session's.
 *
 * A compaction entry reached before any assistant entry means the context was
 * replaced, and an empty context is reported rather than the discarded one the
 * assistant entry above it measures. `/compact`, auto-compact and both rewind
 * summarize directions each append a `compact_boundary` system entry and an
 * `isCompactSummary` user entry; either alone ends the scan.
 */
export function measure(path: string): Measured | null {
	const read = ifPresent(() => tail(path));

	if (read === null) {
		return null;
	}

	for (const entry of newestFirst(
		read.text.split("\n"),
		read.truncated ? 1 : 0,
	)) {
		if (compacted(entry)) {
			return EMPTY;
		}

		if (entry["type"] !== "assistant" || entry["isSidechain"]) {
			continue;
		}

		const message = fieldsOf(entry["message"]);
		const tokens = inputTokens(message["usage"]);

		if (tokens <= 0) {
			continue;
		}

		return { model: String(message["model"] ?? ""), tokens };
	}

	return null;
}

const compacted = (entry: Record<string, unknown>): boolean =>
	(entry["type"] === "system" && entry["subtype"] === "compact_boundary") ||
	(entry["type"] === "user" && entry["isCompactSummary"] === true);

function tail(path: string): { text: string; truncated: boolean } {
	const fd = openSync(path, "r");

	try {
		const size = fstatSync(fd).size;
		const start = Math.max(0, size - TAIL_BYTES);
		const buffer = Buffer.alloc(size - start);

		if (buffer.length > 0) {
			readSync(fd, buffer, 0, buffer.length, start);
		}

		// A tail that starts mid-file also starts mid-line: its first fragment
		// is not a whole entry, and may not even be whole UTF-8.
		return { text: buffer.toString("utf8"), truncated: start > 0 };
	} finally {
		closeSync(fd);
	}
}
