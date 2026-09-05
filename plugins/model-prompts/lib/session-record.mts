// What this session has already been told, kept in
// `<tmpdir>/claude-model-prompts/<session id>.json`: which rows' text is in
// the context, and the model a hook input last named for this session. A run
// reads it once, decides on the value, and writes back what it did.
//
// The injections exist for `on_switch = "once"`: switching away from a model
// and back must not say the same thing twice. Every SessionStart reason
// (startup, resume, clear, compact, fork) builds the context again from
// nothing, so the injections are cleared then. The model is not part of the
// context and outlives that: a session is still on the model its last input
// named, whatever rebuilt the conversation.
//
// One record per session, shared with the faults the reporter records there,
// so a write here carries only the fields it owns.
import { SESSION_STATE } from "./plugin.mts";

export interface SessionRecord {
	readonly injected: readonly string[];
	/** Null until a hook input for this session names a model. */
	readonly model: string | null;
}

export const hasInjected = (record: SessionRecord, key: string): boolean =>
	record.injected.includes(key);

/** What one run leaves behind in the record. */
export interface RecordUpdate {
	/**
	 * True where the run rebuilt the context, emptying what was injected into
	 * the old one.
	 */
	readonly rebuilt: boolean;
	/** The keys this run injected, added to whatever the record holds. */
	readonly injected: readonly string[];
	/** Null for a run whose input named no model, leaving the recorded one standing. */
	readonly model: string | null;
}

/**
 * The record as it stands, read without the lock: what it is read for is which
 * rows to inject and which model to inject them for, and a run would rather
 * decide that against a record a moment out of date than wait on the run
 * writing it.
 */
export function readRecord(sessionId: string): SessionRecord {
	const record = SESSION_STATE.read(sessionId);

	return { injected: injectionsIn(record), model: modelIn(record) };
}

/**
 * The fields this hook owns, written over the rest of the record with the
 * record's lock held: what a run injected is added to the injections as they
 * stand here, rather than to the ones it read before it decided, so an
 * injection another run made in that gap survives.
 *
 * A write that does not land costs a repeated injection, which is not worth
 * failing a session start over. Two things stop one: an unwritable temp
 * directory, and the lock held by another run of the session.
 */
export function writeRecord(sessionId: string, update: RecordUpdate): void {
	SESSION_STATE.update(sessionId, (before) => {
		const fields: Record<string, unknown> = {
			injected: [
				...new Set([
					...(update.rebuilt ? [] : injectionsIn(before)),
					...update.injected,
				]),
			],
		};

		// A model this run only recalled is the record's own, and writing it
		// back would put it over whatever a run since has named.
		if (update.model !== null) {
			fields["model"] = update.model;
		}

		return { fields, result: undefined };
	});
}

const injectionsIn = (record: Record<string, unknown>): readonly string[] => {
	const keys = record["injected"];

	return Array.isArray(keys)
		? keys.filter((key): key is string => typeof key === "string")
		: [];
};

const modelIn = (record: Record<string, unknown>): string | null => {
	const model = record["model"];

	return typeof model === "string" && model !== "" ? model : null;
};
