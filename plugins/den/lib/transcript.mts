// What the tail of a session transcript says, for the reader that asks: the
// handoff reading, which wants the newest turn's context size. It walks the
// entries newest-first, so the walk and what an entry means live here once.
//
// A transcript's lines are whatever Claude Code wrote, and the last one may
// be half-written while the file is appended to, so every field is narrowed
// on the way out rather than trusted.
//
// den's own reader: context-budget has one too, and sharing it through the
// root lib/ would edit that plugin.
import { Buffer } from "node:buffer";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { errorCode, fieldsOf, isTable } from "./shared/fields.mts";

// Room for the newest assistant entry and the question before it: the largest
// line seen in a real transcript is ~100 KB. A fixed tail keeps the cost
// independent of how long the session has grown.
const TAIL_BYTES = 512 * 1024;

export type Entry = Record<string, unknown>;

/** The newest turn's context: how big it was, and which model was sent it. */
export interface Turn {
	readonly kind: "turn";
	readonly model: string;
	readonly tokens: number;
}

/**
 * A compaction newer than any turn: the context was replaced by a summary of
 * itself and nothing has measured the replacement yet.
 */
export interface Compacted {
	readonly kind: "compacted";
}

/**
 * The tail's entries, newest first, or null for a transcript that is not at
 * the path. A path Claude Code names is not always there, and that is neither
 * the user's mistake nor this plugin's bug; any other read error stops the
 * run, since a file that is there and will not be read is something else.
 */
export function tailEntries(path: string): readonly Entry[] | null {
	let read: { text: string; truncated: boolean };

	try {
		read = tail(path);
	} catch (error) {
		if (errorCode(error) === "ENOENT") {
			return null;
		}

		throw error;
	}

	const lines = read.text.split("\n");

	// A truncated tail starts mid-line.
	if (read.truncated) {
		lines.shift();
	}

	const entries: Entry[] = [];

	for (let i = lines.length - 1; i >= 0; i -= 1) {
		const line = lines[i];

		if (line === undefined || line.trim() === "") {
			continue;
		}

		let parsed: unknown;

		try {
			parsed = JSON.parse(line);
		} catch {
			// Half-written, or not JSON: nothing an entry can be read from.
			continue;
		}

		if (isTable(parsed)) {
			entries.push(parsed);
		}
	}

	return entries;
}

/**
 * What the newest entries say the session's context now is, or null when no
 * entry in the tail was a turn. Sidechain entries are a subagent's, so their
 * usage is not the session's.
 */
export function newestTurn(entries: readonly Entry[]): Turn | Compacted | null {
	for (const entry of entries) {
		if (isCompaction(entry)) {
			return { kind: "compacted" };
		}

		if (entry["type"] !== "assistant" || entry["isSidechain"]) {
			continue;
		}

		const usage = fieldsOf(fieldsOf(entry["message"])["usage"]);
		const tokens =
			count(usage["input_tokens"]) +
			count(usage["cache_creation_input_tokens"]) +
			count(usage["cache_read_input_tokens"]);

		// A request that failed before the model saw it is an assistant entry
		// with every usage field zero, and no turn.
		if (tokens > 0) {
			return {
				kind: "turn",
				model: String(fieldsOf(entry["message"])["model"] ?? ""),
				tokens,
			};
		}
	}

	return null;
}

/**
 * `/compact`, auto-compact and a rewind summarize each append a
 * `compact_boundary` system entry then an `isCompactSummary` user entry, so
 * either alone marks where the context was replaced.
 */
const isCompaction = (entry: Entry): boolean =>
	(entry["type"] === "system" && entry["subtype"] === "compact_boundary") ||
	(entry["type"] === "user" && entry["isCompactSummary"] === true);

const count = (value: unknown): number =>
	typeof value === "number" && Number.isFinite(value) ? value : 0;

function tail(path: string): { text: string; truncated: boolean } {
	const fd = openSync(path, "r");

	try {
		const size = fstatSync(fd).size;
		const start = Math.max(0, size - TAIL_BYTES);
		const buffer = Buffer.alloc(size - start);

		readSync(fd, buffer, 0, buffer.length, start);

		return { text: buffer.toString("utf8"), truncated: start > 0 };
	} finally {
		closeSync(fd);
	}
}
