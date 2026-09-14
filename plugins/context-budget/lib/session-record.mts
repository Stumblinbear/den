// The plugin's one record for a session, at
// `<os temp dir>/claude-context-budget/<session id>.json`: the level the
// context notice last stood at, the resume answers the guard has spent, and
// the watcher's state. `updateRecord` reads and changes it under the lock
// beside it.
//
// Each of the three hook entries writes only the fields it owns, merged over
// the rest, so none of them drops another's. Nothing deletes the record, since
// the answers a session has spent stay spent when its context falls back to
// nothing.
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
	/** The level the context notice now stands at. */
	readonly level?: Level;
	/** The uuid of every resume answer spent, replacing the list on file. */
	readonly consumed?: readonly string[];
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

/** The fields as the file spells them. */
function written(fields: RecordFields): Record<string, unknown> {
	const record: Record<string, unknown> = {};

	if (fields.level !== undefined) {
		record["level"] = fields.level;
	}

	if (fields.consumed !== undefined) {
		record["consumed"] = fields.consumed;
	}

	if (fields.watcher !== undefined) {
		record["watcher"] = fields.watcher;
	}

	return record;
}
