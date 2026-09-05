// SessionStart and PostModelSwitch hook. Prints the configured prompts for the
// active model into the main session's context: Claude Code adds whatever
// these two events write on stdout to the context, so the whole output is one
// header line and the matching rows' text.
//
// Subagents get nothing. SessionStart never fires for them, and a rule written
// for the model the main session is driving is not automatically a rule for an
// agent that happens to share it.
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { runEntry } from "../lib/entry.mts";
import {
	type ActiveModel,
	type HookEvent,
	isHookEvent,
	matchingRows,
	modelFor,
} from "./model.mts";
import { FAULTS } from "./plugin.mts";
import { loadRows, type Row } from "./rows.mts";
import {
	hasInjected,
	readRecord,
	type SessionRecord,
	withInjections,
	withModel,
	withoutInjections,
	writeRecord,
} from "./session-record.mts";

const SETTINGS = join(homedir(), ".claude", "settings.json");

const args = process.argv.slice(2);

/**
 * The record as this run leaves it before anything can fail: a session start
 * has rebuilt the context this record described, and a model the input named
 * is the one a later run with nothing of its own to go on reads back.
 */
function noted(
	event: HookEvent,
	model: ActiveModel | null,
	record: SessionRecord,
): SessionRecord {
	const rebuilt = event === "SessionStart" ? withoutInjections(record) : record;

	return model?.named ? withModel(rebuilt, model.id) : rebuilt;
}

/** What this hook run puts into the session's context, and the record saying so. */
interface Injection {
	readonly text: string;
	readonly record: SessionRecord;
}

/** Null for a run with nothing to say. */
async function injection(
	event: HookEvent,
	model: ActiveModel | null,
	record: SessionRecord,
): Promise<Injection | null> {
	// Read on every run, and before the model is judged, so a broken install or
	// a broken config is reported on the session's first hook run rather than
	// whenever the first matching model happens to come up.
	const rows = await loadRows(args);

	if (model === null) {
		return null;
	}

	const firing = firingRows(event, rows, model.id, record);

	if (firing.length === 0) {
		return null;
	}

	return {
		text: `Rules for the current model (${model.id}):\n\n${firing.map((row) => row.text).join("\n\n")}\n`,
		record: withInjections(
			record,
			firing.map((row) => row.key),
		),
	};
}

function firingRows(
	event: HookEvent,
	rows: readonly Row[],
	model: string,
	record: SessionRecord,
): readonly Row[] {
	return matchingRows(rows, model).filter((row) => fires(event, row, record));
}

// `once` means "this row's text is already in this context", which is why a
// SessionStart injection is recorded too: start on a model, switch away, come
// back, and the rule is still there from the start.
function fires(event: HookEvent, row: Row, record: SessionRecord): boolean {
	if (event === "SessionStart") {
		return row.onStart;
	}

	if (row.onSwitch === "never") {
		return false;
	}

	if (row.onSwitch === "every") {
		return true;
	}

	return !hasInjected(record, row.key);
}

// The run itself, last in the file and below every binding it reads: a `const`
// read from here before its own declaration throws a ReferenceError, which the
// runner would report as the bug it is.
await runEntry(FAULTS, async ({ input, session }) => {
	// The main session: a subagent's input names the agent it is for.
	if (input["agent_id"] || session === "") {
		return null;
	}

	const event = String(input["hook_event_name"] ?? "");

	if (!isHookEvent(event)) {
		return null;
	}

	const before = readRecord(session);
	const model = modelFor(event, input, before.model, SETTINGS);

	// Settled before the configuration is read: what the session is on, and
	// that it has rebuilt its context, are facts about the session whether or
	// not there is a usable configuration to act on them with. Written back
	// however this run ends, so a switch made while the config is broken is
	// still the model a later run reads back.
	let record = noted(event, model, before);

	try {
		const injected = await injection(event, model, record);

		if (injected === null) {
			return null;
		}

		record = injected.record;

		return injected.text;
	} finally {
		writeRecord(session, record);
	}
});
