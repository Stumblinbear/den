// Where a plugin's disposable state lives: one JSON record per session, with
// the lock it is written under beside it. The OS temp directory and never the
// project or the data directory, since every file under it is worthless the
// moment the session that wrote it ends.
//
// One record per session per plugin, whatever writes it: what a run has
// measured and what it has already said are both facts about one session.
// Every writer merges the fields it owns over what is there, so a writer that
// knows nothing about another's fields cannot drop them.
//
// Claude Code runs tool calls in parallel, so two of a plugin's entries can be
// writing at once. Every write here takes the record's own lock, since a merge
// that read the file outside that lock writes back over whatever landed
// between its read and itself. A run that has to be the only one of its kind
// the session has takes a lock of its own beside the record, through `hold`,
// and keeps it for as long as its work lasts.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isTable } from "./fields.mts";
import { type Locked, underLock, underLockAsync } from "./file-lock.mts";

/** What a change to the record leaves behind. */
export interface Change<T> {
	/**
	 * Null to write nothing, for a change that found nothing to write. A field
	 * set to `undefined` is removed from the record, since the serializer drops
	 * it; one set to `null` is written as null.
	 */
	readonly fields: Record<string, unknown> | null;
	/** What the caller wanted out of the record it was handed. */
	readonly result: T;
}

/**
 * One plugin's record per session: how a run reads one back, and how it
 * writes one. A record that cannot be written is left as it was and nothing
 * is raised: what one lost record costs is written where each caller handles
 * it, and none of them would fail a tool call over a temp directory.
 */
export interface SessionState {
	/**
	 * The record's fields as they were written. Empty for a session with no
	 * record, and for one left unreadable by a run that died: as far as anyone
	 * can tell, that session has done nothing and been told nothing.
	 *
	 * Read without the lock, since a reader changes nothing and would rather
	 * report a record as empty than wait on the run that is writing it.
	 */
	read(key: string): Record<string, unknown>;
	/**
	 * The record read, changed and written back with the lock held, which is
	 * what a writer whose fields depend on what is already there needs.
	 *
	 * A run that cannot take the lock changes nothing and is handed nothing:
	 * the record is only ever read under that lock, so there is no `before` to
	 * give `change` either.
	 */
	update<T>(
		key: string,
		change: (before: Readonly<Record<string, unknown>>) => Change<T>,
	): Locked<T>;
	/**
	 * Runs `work` with the lock named `name` held, for a run that has to be the
	 * only one of its kind the session has. The lock stands beside the record
	 * rather than on it, so `update` goes through for every writer meanwhile,
	 * and it is held until `work` settles, however long that takes.
	 *
	 * A run that cannot take the lock does no work and is handed nothing.
	 *
	 * `name` reaches the filesystem as written, so pass a constant and never
	 * anything read off a run's input.
	 */
	hold<T>(
		key: string,
		name: string,
		work: () => Promise<T>,
	): Promise<Locked<T>>;
}

export function sessionState(directory: string): SessionState {
	const dir = join(tmpdir(), directory);
	/**
	 * Where one of a session's files sits: the record, the lock it is written
	 * under, or a lock held beside it. A key is a session id off a run's input,
	 * so it is sanitized rather than trusted as a path component, and building
	 * all three names here keeps them from drifting apart.
	 */
	const file = (key: string, suffix: string): string =>
		join(dir, `${key.replace(/[^A-Za-z0-9._-]/g, "_")}.${suffix}`);
	const read = (key: string): Record<string, unknown> => {
		try {
			const parsed: unknown = JSON.parse(
				readFileSync(file(key, "json"), "utf8"),
			);

			return isTable(parsed) ? parsed : {};
		} catch {
			return {};
		}
	};
	const write = (key: string, fields: Record<string, unknown>): void => {
		try {
			const record = { ...read(key), ...fields };

			mkdirSync(dir, { recursive: true });
			writeFileSync(file(key, "json"), JSON.stringify(record));
		} catch {
			// The record stands as it was, and the caller is told nothing it
			// would have done anything about.
		}
	};
	const update = <T,>(
		key: string,
		change: (before: Readonly<Record<string, unknown>>) => Change<T>,
	): Locked<T> =>
		underLock(file(key, "lock"), () => {
			const changed = change(read(key));

			if (changed.fields !== null) {
				write(key, changed.fields);
			}

			return changed.result;
		});
	const hold = <T,>(
		key: string,
		name: string,
		work: () => Promise<T>,
	): Promise<Locked<T>> => underLockAsync(file(key, `${name}.lock`), work);

	return {
		read,
		update,
		hold,
	};
}
