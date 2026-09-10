// The relay both of den's hook pairs are built from: a SubagentStop half that
// records a finished subagent in a file of its own, and a UserPromptSubmit
// half that turns every pending file into one reminder for the main session.
//
// It takes two halves because a SubagentStop hook cannot write into the
// parent's context: its additionalContext goes to the subagent and loops it.
// A UserPromptSubmit hook's additionalContext does land there, on the turn the
// lead is next invoked on, which is exactly when the subagent has
// finished.
//
// Reviewers and implementers routinely finish at the same moment, so each
// completion drops its OWN file, keyed by agent_id; a shared file read,
// modified and written by two racing hooks would lose entries. A file written
// after the injecting half listed the directory is left alone and picked up
// next time.
import {
	mkdirSync,
	readdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fieldsOf } from "./shared/fields.mts";

/** One finished subagent, as the recording half left it. */
export interface Flag {
	/** Empty when the file carried no type; the reminder then names none. */
	readonly agentType: string;
}

/**
 * Where a relay's pending flags wait: a directory of its own under the OS temp
 * directory, since every file in it is worthless once its reminder has been
 * injected, with one subdirectory per session, since the temp directory is
 * the machine's and a flag another session's agent left would otherwise be
 * announced here. Both halves of a pair take the directory from here, so the
 * half that writes a flag and the half that reads it cannot name it
 * differently. Null when the input carries no session id: a flag nobody
 * could read back is not worth writing. Rests on a SubagentStop carrying the
 * parent session's id, the same one the next UserPromptSubmit carries, which
 * `transcript-record` already relies on; were that ever false, both relays
 * would fall silent.
 */
export function reviewTriageDir(input: Record<string, unknown>): string | null {
	return triageDir("claude-review-triage", input);
}
/** Where the implementer-triage relay's pending flags wait; see reviewTriageDir. */
export function implementerTriageDir(
	input: Record<string, unknown>,
): string | null {
	return triageDir("claude-implementer-triage", input);
}

function triageDir(
	relay: string,
	input: Record<string, unknown>,
): string | null {
	const session = input["session_id"];
	if (typeof session !== "string" || session === "") {
		return null;
	}
	// The id is a directory component, so no dot survives: `..` would resolve
	// the relay to the temp directory itself, and the drain would then delete
	// and announce every JSON file there. Claude Code's ids are hex and
	// hyphens, so nothing real is rewritten.
	return join(tmpdir(), relay, session.replace(/[^A-Za-z0-9_-]/g, "_"));
}

/**
 * Records one finished subagent as a flag file in `dir`, which it creates when
 * missing. Takes `agent_id` and `agent_type` from the hook input, and throws
 * if the write fails.
 *
 * A stop that carries no type is dropped: the matcher that scopes the hook
 * cannot have matched an empty type, so Claude Code ran the hook unscoped,
 * and a reminder for it would name nobody.
 */
export function raiseFlag(dir: string, input: Record<string, unknown>): void {
	if (typeof input["agent_type"] !== "string" || input["agent_type"] === "") {
		return;
	}
	const id = typeof input["agent_id"] === "string" ? input["agent_id"] : "";

	// agent_id is unique per subagent, which completes once, so it is both a
	// collision-free file name and an idempotent one.
	const name = (
		id || `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
	).replace(/[^A-Za-z0-9._-]/g, "_");

	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, `${name}.json`),
		// The type and nothing else: it is all the reminder names, and the id
		// is already the file's name.
		JSON.stringify({ agent_type: input["agent_type"] }),
	);
}

/** Every pending flag; each file listed is deleted, readable or not. */
export function takeFlags(dir: string): readonly Flag[] {
	let files: readonly string[];

	try {
		files = readdirSync(dir).filter((file) => file.endsWith(".json"));
	} catch {
		// No directory yet, so nothing has ever been flagged.
		return [];
	}

	const pending: Flag[] = [];

	for (const file of files) {
		const path = join(dir, file);

		try {
			pending.push(flagIn(JSON.parse(readFileSync(path, "utf8"))));
		} catch {
			// Unreadable or half-written: skipped, and still removed below.
		}

		try {
			unlinkSync(path);
		} catch {
			// Already claimed by a concurrent injector, which is harmless.
		}
	}

	return pending;
}

/** The agent types a reminder names, empty when the flags carried none. */
export const who = (pending: readonly Flag[]): string =>
	pending
		.map((flag) => flag.agentType)
		.filter(Boolean)
		.join(", ");

/**
 * Writes `text` to stdout as a UserPromptSubmit result, which is the whole of
 * that hook's output: call it once, and from no other event.
 */
export function inject(text: string): void {
	process.stdout.write(
		JSON.stringify({
			hookSpecificOutput: {
				hookEventName: "UserPromptSubmit",
				additionalContext: text,
			},
		}),
	);
}

function flagIn(parsed: unknown): Flag {
	const type = fieldsOf(parsed)["agent_type"];

	return { agentType: typeof type === "string" ? type : "" };
}
