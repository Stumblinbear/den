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
import { configPath, loadConfig, type Row } from "./config.mts";
import { HookFault, reportOnce } from "./fault.mts";
import {
	type ActiveModel,
	type HookEvent,
	isHookEvent,
	matchingRows,
	modelFor,
} from "./model.mts";
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

const path = configPath(process.argv.slice(2));

// Out here because a fault is reported against the session it happened in, and
// because both of the things a run leaves behind are settled on the way out.
let session = "";
let record: SessionRecord | null = null;
let output: string | null = null;

try {
	const fields = fieldsIn(await stdinText());

	// The main session: a subagent's input names the agent it is for.
	if (fields !== null && !fields["agent_id"]) {
		const event = String(fields["hook_event_name"] ?? "");

		session = String(fields["session_id"] ?? "");

		if (isHookEvent(event) && session !== "") {
			const before = readRecord(session);
			const model = modelFor(event, fields, before.model, SETTINGS);

			// Settled before the configuration is read: what the session is on,
			// and that it has rebuilt its context, are facts about the session
			// whether or not there is a usable configuration to act on them with.
			record = noted(event, model, before);

			const injected = await injection(event, model, record);

			if (injected !== null) {
				record = injected.record;
				output = injected.text;
			}
		}
	}
} catch (error) {
	fail(session, error);
}

if (record !== null) {
	writeRecord(session, record);
}

if (output !== null) {
	// Written on the way out rather than followed by `process.exit`, which can
	// truncate a piped stdout before it has flushed.
	process.stdout.write(output);
}

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
	const rows = await loadConfig(path);

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

/**
 * A hook that cannot do its job must never stall a session start or a model
 * switch, so it ends in one line and an exit code rather than a stack trace.
 * A fault the session has already been told about is not worth repeating.
 */
function fail(sessionId: string, error: unknown): void {
	if (error instanceof HookFault) {
		process.exitCode = reportOnce(sessionId, error) ? 1 : 0;

		return;
	}

	process.stderr.write(
		`model-prompts: ${error instanceof Error ? error.message : String(error)}\n`,
	);
	process.exitCode = 1;
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

function fieldsIn(text: string): Record<string, unknown> | null {
	const input: unknown = JSON.parse(text || "{}");

	return typeof input === "object" && input !== null
		? (input as Record<string, unknown>)
		: null;
}

function stdinText(): Promise<string> {
	return new Promise((done) => {
		let data = "";

		process.stdin.on("data", (chunk) => {
			data += String(chunk);
		});

		process.stdin.on("end", () => {
			done(data);
		});
	});
}
