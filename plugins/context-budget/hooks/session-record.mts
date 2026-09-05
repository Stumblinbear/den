// What this session has been told and what it has spent, kept in
// `<os temp dir>/claude-context-budget/<session id>.json`: the level the
// context notice last measured, and the resume answers the guard has already
// spent. A run reads it, works on the value and writes it back, all of that
// under the lock beside it.
//
// One record for the whole plugin, rather than a file per fact: an answer is
// spent by writing its uuid here, not by the existence of a file named after
// it.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isTable } from "../lib/fields.mts";
import { type Locked, underLock } from "../lib/file-lock.mts";
import { LEVELS, type Level } from "./level.mts";
import { SESSION_STATE } from "./plugin.mts";

export interface SessionRecord {
	readonly level: Level;
	/** The uuid of every resume answer this session has already spent. */
	readonly consumed: readonly string[];
}

const NOTHING: SessionRecord = { level: "none", consumed: [] };

const recordFile = (sessionId: string): string =>
	SESSION_STATE.file(sessionId, "json");

const lockFile = (sessionId: string): string =>
	SESSION_STATE.file(sessionId, "lock");

/** What a change to the record leaves behind. */
export interface Update<T> {
	/** Null to write nothing, for a change that found nothing to make. */
	readonly record: SessionRecord | null;
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
 */
export function updateRecord<T>(
	sessionId: string,
	change: (before: SessionRecord) => Update<T>,
): Locked<T> {
	return underLock(lockFile(sessionId), () => {
		const update = change(readRecord(sessionId));

		if (update.record !== null) {
			writeRecord(sessionId, update.record);
		}

		return update.result;
	});
}

function readRecord(sessionId: string): SessionRecord {
	try {
		const parsed: unknown = JSON.parse(
			readFileSync(recordFile(sessionId), "utf8"),
		);

		if (!isTable(parsed)) {
			return NOTHING;
		}

		const consumed = parsed["consumed"];

		return {
			level: LEVELS.find((known) => known === parsed["level"]) ?? "none",
			consumed: Array.isArray(consumed)
				? consumed.filter((uuid): uuid is string => typeof uuid === "string")
				: [],
		};
	} catch {
		// No record yet, or one left unreadable by a killed run: as far as
		// anyone can tell this session has been told nothing and spent nothing.
		return NOTHING;
	}
}

function writeRecord(sessionId: string, record: SessionRecord): void {
	try {
		if (record.level === "none" && record.consumed.length === 0) {
			// A context back to nothing with no answer spent is a session the
			// next climb starts over from, so nothing is left in the temp
			// directory for it.
			rmSync(recordFile(sessionId), { force: true });

			return;
		}

		mkdirSync(SESSION_STATE.dir, { recursive: true });
		writeFileSync(recordFile(sessionId), JSON.stringify(record));
	} catch {
		// A record that cannot be written costs a repeated notice, or a resume
		// answer that can be spent twice; neither is worth failing a tool call
		// over.
	}
}
