// How full the session's context is, read from the newest assistant turn in
// the transcript's tail.
import { Buffer } from "node:buffer";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import {
	ifPresent,
	inputTokens,
	isCompaction,
	newestFirst,
	turnModel,
	turnUsage,
} from "./transcript.mts";

// Enough to hold the newest assistant entry with room to spare: the largest
// line seen in a real transcript is ~100 KB, and an assistant entry is bounded
// by the model's output limit. A fixed tail keeps the cost of a hook that runs
// on every tool call independent of how long the session has grown.
const TAIL_BYTES = 512 * 1024;

/** The newest turn's context: how big it was, and which model was sent it. */
export interface Measured {
	readonly kind: "turn";
	readonly model: string;
	readonly tokens: number;
}

/**
 * A compaction newer than any turn: the context was replaced by a summary of
 * itself, and no turn has been sent the replacement yet. There is no size to
 * quote and no model to look a threshold up under.
 */
export interface Compacted {
	readonly kind: "compacted";
}

export type Reading = Measured | Compacted;

const COMPACTED: Compacted = { kind: "compacted" };

/**
 * What the transcript's tail says the session's context now is, or null when
 * there is nothing to read: no transcript at that path, or a tail holding no
 * turn. Sidechain entries belong to a subagent sharing the transcript, so
 * their usage is not the session's.
 *
 * A compaction entry reached before any assistant entry means the context was
 * replaced, so the compaction is reported rather than the discarded context
 * the assistant entry above it measures.
 */
export function measure(path: string): Reading | null {
	const read = ifPresent(() => tail(path));

	if (read === null) {
		return null;
	}

	for (const entry of newestFirst(
		read.text.split("\n"),
		read.truncated ? 1 : 0,
	)) {
		if (isCompaction(entry)) {
			return COMPACTED;
		}

		if (entry["type"] !== "assistant" || entry["isSidechain"]) {
			continue;
		}

		const usage = turnUsage(entry);

		if (usage === null) {
			continue;
		}

		return {
			kind: "turn",
			model: turnModel(entry),
			tokens: inputTokens(usage),
		};
	}

	return null;
}

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
