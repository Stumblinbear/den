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
import {
	type ActiveModel,
	type HookEvent,
	isHookEvent,
	matchingRows,
	modelFor,
} from "../lib/model.mts";
import { FAULTS } from "../lib/plugin.mts";
import { loadRows, type Row } from "../lib/rows.mts";
import {
	hasInjected,
	readRecord,
	type SessionRecord,
	writeRecord,
} from "../lib/session-record.mts";
import { runEntry } from "../lib/shared/entry.mts";

const SETTINGS = join(homedir(), ".claude", "settings.json");

const args = process.argv.slice(2);

/** What this hook run puts into the session's context, and the rows it is from. */
interface Injection {
	readonly text: string;
	readonly keys: readonly string[];
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
		keys: firing.map((row) => row.key),
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
//
// No prompt event is named, because `hooks.json` puts this plugin on the start
// of a session and on a model switch and on nothing that fires twice inside
// one turn: every run of it reports the fault it meets.
await runEntry({ faults: FAULTS }, async ({ input, session, event }) => {
	// The main session: a subagent's input names the agent it is for.
	if (input["agent_id"] || session === "") {
		return null;
	}

	if (!isHookEvent(event)) {
		return null;
	}

	const before = readRecord(session);
	const model = modelFor(event, input, before.model, SETTINGS);
	let injected: readonly string[] = [];

	try {
		const firing = await injection(event, model, before);

		if (firing === null) {
			return null;
		}

		injected = firing.keys;

		return firing.text;
	} finally {
		// What the session is on, and that it has rebuilt its context, are facts
		// about the session whether or not there is a usable configuration to act
		// on them with, so they are written however this run ends: a switch made
		// while the config is broken is still the model a later run reads back.
		writeRecord(session, {
			rebuilt: event === "SessionStart",
			injected,
			model: model?.named ? model.id : null,
		});
	}
});
