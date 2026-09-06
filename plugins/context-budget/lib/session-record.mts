// What this session has been told and spent, kept in the plugin's one record
// for it, `<os temp dir>/claude-context-budget/<session id>.json`: the level
// the context notice last stood at, the resume answers the guard has already
// spent, where the watcher's own pace stands, and the transcript the last
// measuring run read. That last is how the cut-point script, handed a session
// id and nothing else, finds the transcript to read. A hook run reads it,
// works on the value and writes it back, all of that under the lock beside it;
// the script only reads, and takes no lock.
//
// Every write merges the fields it owns over the rest and takes that lock,
// whichever writer makes it, so the transcript path, the spent answers and the
// faults the shared reporter records cannot drop one another. Nothing here
// deletes the record: a session whose context has fallen back to nothing still
// has a transcript the script has to find.
import { LEVELS, type Level } from "./level.mts";
import { SESSION_STATE } from "./plugin.mts";
import type { Locked } from "./shared/file-lock.mts";
import { type WatcherState, watcherIn } from "./watcher.mts";

/** What a change to the record is handed. */
export interface SessionRecord {
	readonly level: Level;
	/** The uuid of every resume answer this session has already spent. */
	readonly consumed: readonly string[];
	readonly watcher: WatcherState;
}

/** What one run writes back: the fields it owns, and none of anyone else's. */
export interface RecordFields {
	readonly level?: Level;
	readonly consumed?: readonly string[];
	/** The transcript the run read, rewritten by every run that measures. */
	readonly transcript?: string;
	/**
	 * Written whole, under the lock, by the Stop entry that owns it: what the
	 * watcher keeps is one state rather than fields anyone merges into.
	 */
	readonly watcher?: WatcherState;
}

/** What a change to the record leaves behind, in this plugin's fields. */
export interface Update<T> {
	/** Null to write nothing, for a change that found nothing to write. */
	readonly fields: RecordFields | null;
	/** What the caller wanted out of the record it was handed. */
	readonly result: T;
}

/**
 * The record read, changed and written back with the lock held. Claude Code
 * runs tool calls in parallel, so the guard's PreToolUse and the measurement's
 * PostToolUse overlap, and either one writing back a read it took before the
 * other's change loses that change.
 *
 * A run that cannot take the lock changes nothing and is handed nothing: the
 * record is only ever read under that lock, so there is no `before` to give
 * `change` either. What a skipped change costs is the caller's to say.
 *
 * A run that took the lock is handed its result whether or not the write
 * landed: a lost record costs a repeated notice or an answer spent twice,
 * neither of which is worth failing a tool call over.
 */
export function updateRecord<T>(
	sessionId: string,
	change: (before: SessionRecord) => Update<T>,
): Locked<T> {
	return SESSION_STATE.update(sessionId, (record) => {
		const update = change(readFields(record));

		return {
			fields: update.fields === null ? null : written(update.fields),
			result: update.result,
		};
	});
}

/**
 * The transcript the last measurement was read from, and null for a session
 * this plugin has never measured. Read without the lock: the script is not
 * changing anything, and a path half-written by a run holding the lock is one
 * this reader would rather report as absent than wait for.
 */
export function recordedTranscript(sessionId: string): string | null {
	const path = SESSION_STATE.read(sessionId)["transcript_path"];

	return typeof path === "string" && path !== "" ? path : null;
}

/** The other way from `written`: the record as the change is handed it. */
function readFields(record: Record<string, unknown>): SessionRecord {
	const consumed = record["consumed"];

	return {
		level: LEVELS.find((known) => known === record["level"]) ?? "none",
		consumed: Array.isArray(consumed)
			? consumed.filter((uuid): uuid is string => typeof uuid === "string")
			: [],
		watcher: watcherIn(record["watcher"]),
	};
}

/**
 * The fields as the file spells them. The transcript is named the way the rest
 * of Claude Code names one, since a person reading the file by hand is the
 * other audience for it.
 */
function written(fields: RecordFields): Record<string, unknown> {
	const record: Record<string, unknown> = {};

	if (fields.level !== undefined) {
		record["level"] = fields.level;
	}

	if (fields.consumed !== undefined) {
		record["consumed"] = fields.consumed;
	}

	if (fields.transcript !== undefined) {
		record["transcript_path"] = fields.transcript;
	}

	if (fields.watcher !== undefined) {
		record["watcher"] = fields.watcher;
	}

	return record;
}
