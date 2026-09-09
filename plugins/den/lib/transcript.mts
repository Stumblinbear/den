// What the tail of a session transcript says, for the two readers that ask:
// the handoff reading, which wants the newest turn's context size, and the
// switch hook, which wants the newest AskUserQuestion answer and whether the
// user has typed since. Both walk the same entries newest-first, so the walk
// and what an entry means live here once.
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

/** One answered AskUserQuestion, as the transcript records it. */
export interface Answer {
	readonly questions: readonly { header: string; question: string }[];
	/** Question text to the label chosen. */
	readonly answers: Readonly<Record<string, string>>;
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
export const isCompaction = (entry: Entry): boolean =>
	(entry["type"] === "system" && entry["subtype"] === "compact_boundary") ||
	(entry["type"] === "user" && entry["isCompactSummary"] === true);

/**
 * Something the user typed, as opposed to what Claude Code writes under the
 * user role: a tool result, a background task's completion notice (a
 * `<task-notification>` body, with `promptSource: "system"` or, in an
 * SDK-driven session, `"sdk"`), a slash command's output and the caveat a
 * resumed session gets (opening on `<local-command-`), and a skill's body
 * (`isMeta`). A typed prompt carries `promptSource` of `typed`, `queued` or
 * `sdk`, or none on older builds, so the field is read for what it rules
 * out rather than required.
 *
 * A slash command is string content opening on `<command-name>` or
 * `<command-message>`. The command alone is not the user saying anything,
 * but words after its name are: `/den:coordination drop the row` is typed,
 * `/den:coordination` is not. `/model` is the exception, since its argument
 * is the model.
 */
export function isUserPrompt(entry: Entry): boolean {
	if (
		entry["type"] !== "user" ||
		entry["isSidechain"] ||
		entry["promptSource"] === "system" ||
		entry["toolUseResult"] !== undefined
	) {
		return false;
	}

	const content = fieldsOf(entry["message"])["content"];

	if (typeof content === "string") {
		const text = content.trim();
		const command = commandOf(entry);

		if (command !== null) {
			return command.name !== MODEL_COMMAND && command.args !== "";
		}

		return (
			text !== "" &&
			entry["isMeta"] !== true &&
			!text.startsWith("<local-command-") &&
			!text.startsWith("<task-notification>")
		);
	}

	return (
		entry["isMeta"] !== true &&
		Array.isArray(content) &&
		content.some((block) => fieldsOf(block)["type"] === "text") &&
		!content.some((block) => fieldsOf(block)["type"] === "tool_result")
	);
}

/**
 * The answered question this entry is, or null. Claude Code writes an
 * AskUserQuestion result as a user entry whose `toolUseResult` carries the
 * questions asked and the label chosen for each, keyed by question text.
 */
export function askedAnswer(entry: Entry): Answer | null {
	if (entry["type"] !== "user" || entry["isSidechain"]) {
		return null;
	}

	const result = fieldsOf(entry["toolUseResult"]);
	const asked = result["questions"];
	const chosen = result["answers"];

	if (!Array.isArray(asked) || !isTable(chosen)) {
		return null;
	}

	const questions = asked.map((question) => ({
		header: String(fieldsOf(question)["header"] ?? ""),
		question: String(fieldsOf(question)["question"] ?? ""),
	}));
	const answers: Record<string, string> = {};

	for (const [question, label] of Object.entries(chosen)) {
		if (typeof label === "string") {
			answers[question] = label;
		}
	}

	return { questions, answers };
}

/**
 * The command that switches the session's model, as its entry names it. Its
 * argument is the model, not the user saying anything.
 */
const MODEL_COMMAND = "/model";

/**
 * The slash command this entry records, or null. Claude Code writes one as
 * string content under the user role opening on `<command-name>` or
 * `<command-message>`, with what followed the name in `<command-args>`.
 */
function commandOf(
	entry: Entry,
): { readonly name: string; readonly args: string } | null {
	if (entry["type"] !== "user" || entry["isSidechain"]) {
		return null;
	}

	const content = fieldsOf(entry["message"])["content"];

	if (typeof content !== "string") {
		return null;
	}

	const text = content.trim();

	if (!/^<command-(name|message)>/.test(text)) {
		return null;
	}

	return {
		name: (
			/<command-name>([^<]*)<\/command-name>/.exec(text)?.[1] ?? ""
		).trim(),
		args: (
			/<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1] ?? ""
		).trim(),
	};
}

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
