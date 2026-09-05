// SubagentStop half of the implementer-diagnostics relay: a finished
// implementer that edited a Rust source leaves a flag, and nothing else.
//
// After an implementer edits many files, rust-analyzer/IDE diagnostics lag in
// a stale mid-edit state, and the coordinator takes them for findings: a
// throwaway `cargo check` to "verify" them, and a narrated contradiction
// between the agent's report and the diagnostics that does not exist.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	bareType,
	IMPLEMENTER_DIAGNOSTICS_DIR,
	raiseFlag,
} from "../lib/relay.mts";
import { fieldsOf } from "../lib/shared/fields.mts";
import { hookInput } from "../lib/shared/hook-input.mts";

// Agents that edit the working tree and report a finished state. Any of them
// leaves rust-analyzer lagging, so all of them get the reminder.
const IMPLEMENTERS: readonly string[] = [
	"implementer-opus",
	"implementer-haiku",
	"implementer-fable",
	"red-green-fixer",
];

const EDITS: readonly string[] = ["Edit", "Write", "MultiEdit", "NotebookEdit"];

/**
 * Whether the finished subagent edited a Rust source. Its transcript sits
 * under the main transcript's directory, keyed by agent_id; every edit is an
 * assistant tool_use block whose input carries the path. The reminder is about
 * rust-analyzer lag, so an implementer that touched no .rs file leaves no flag,
 * and no transcript is no evidence and leaves none either.
 */
function editedRust(transcriptPath: unknown, agentId: unknown): boolean {
	if (typeof transcriptPath !== "string" || typeof agentId !== "string") {
		return false;
	}

	const file = join(
		transcriptPath.replace(/\.jsonl$/, ""),
		"subagents",
		`agent-${agentId}.jsonl`,
	);

	let text: string;

	try {
		text = readFileSync(file, "utf8");
	} catch {
		return false;
	}

	return text
		.split("\n")
		.filter((line) => line.includes('"tool_use"'))
		.some(editsRust);
}

function editsRust(line: string): boolean {
	let entry: unknown;

	try {
		entry = JSON.parse(line);
	} catch {
		return false;
	}

	return blocksIn(entry).some(
		(block) =>
			EDITS.includes(String(block["name"])) &&
			/\.rs$/i.test(editedPath(block["input"])),
	);
}

function blocksIn(entry: unknown): readonly Record<string, unknown>[] {
	const fields = fieldsOf(entry);

	if (fields["type"] !== "assistant") {
		return [];
	}

	const content = fieldsOf(fields["message"])["content"];

	return Array.isArray(content)
		? content.map(fieldsOf).filter((block) => block["type"] === "tool_use")
		: [];
}

function editedPath(input: unknown): string {
	const fields = fieldsOf(input);

	return String(fields["file_path"] ?? fields["notebook_path"] ?? "");
}

try {
	const input = await hookInput();

	// Filtered here rather than on the settings matcher, which does not
	// reliably scope a SubagentStop hook: it fires for every subagent.
	if (
		input !== null &&
		IMPLEMENTERS.includes(bareType(input["agent_type"])) &&
		editedRust(input["transcript_path"], input["agent_id"])
	) {
		raiseFlag(IMPLEMENTER_DIAGNOSTICS_DIR, input);
	}
} catch {
	// Never fail loudly: a broken flag write must not block the subagent.
}
