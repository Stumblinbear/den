// What this session has already been told, kept in
// `<tmpdir>/claude-model-prompts/<session id>.json`: which rows' text is in
// the context, and the model a hook input last named for this session. A run
// reads it once, works on the value, and writes what it ends up with.
//
// The injections exist for `on_switch = "once"`: switching away from a model
// and back must not say the same thing twice. Every SessionStart reason --
// startup, resume, clear, compact, fork -- builds the context again from
// nothing, so the injections are cleared then. The model is not part of the
// context and outlives that: a session is still on the model its last input
// named, whatever rebuilt the conversation.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { STATE_DIR, stateFile } from "./session-state.mts";

export interface SessionRecord {
	readonly injected: readonly string[];
	/** Null until a hook input for this session names a model. */
	readonly model: string | null;
}

const NOTHING: SessionRecord = { injected: [], model: null };

const recordFile = (sessionId: string): string => stateFile(sessionId, "json");

export const hasInjected = (record: SessionRecord, key: string): boolean =>
	record.injected.includes(key);

/** The context is being rebuilt, so what was injected into the old one is gone. */
export const withoutInjections = (record: SessionRecord): SessionRecord => ({
	...record,
	injected: [],
});

export const withInjections = (
	record: SessionRecord,
	keys: readonly string[],
): SessionRecord => ({
	...record,
	injected: [...new Set([...record.injected, ...keys])],
});

/**
 * How the record learns what a session is on: a later run with nothing of its
 * own to go on reads it back.
 */
export const withModel = (
	record: SessionRecord,
	model: string,
): SessionRecord => ({ ...record, model });

export function readRecord(sessionId: string): SessionRecord {
	try {
		const parsed: unknown = JSON.parse(
			readFileSync(recordFile(sessionId), "utf8"),
		);

		if (typeof parsed !== "object" || parsed === null) {
			return NOTHING;
		}

		const fields = parsed as Record<string, unknown>;
		const keys = fields["injected"];
		const model = fields["model"];

		return {
			injected: Array.isArray(keys)
				? keys.filter((key): key is string => typeof key === "string")
				: [],
			model: typeof model === "string" && model !== "" ? model : null,
		};
	} catch {
		// No record yet, or one left unreadable by a killed run: this session
		// has said nothing and switched nowhere as far as anyone can tell.
		return NOTHING;
	}
}

export function writeRecord(sessionId: string, record: SessionRecord): void {
	try {
		if (record.model === null && record.injected.length === 0) {
			// Nothing worth reading back, so nothing is left in the temp
			// directory for a session that never got anywhere.
			rmSync(recordFile(sessionId), { force: true });

			return;
		}

		mkdirSync(STATE_DIR, { recursive: true });
		writeFileSync(recordFile(sessionId), JSON.stringify(record));
	} catch {
		// A record that cannot be written costs a repeated injection, which is
		// not worth failing a session start over.
	}
}
