// The relay both of den's hook pairs are built from: a SubagentStop half that
// records a finished subagent in a file of its own, and a UserPromptSubmit
// half that turns every pending file into one reminder for the main session.
//
// It takes two halves because a SubagentStop hook cannot write into the
// parent's context -- its additionalContext goes to the subagent and loops it
// -- while UserPromptSubmit's does land there, on the turn the coordinator is
// next invoked on, which is exactly when the subagent has finished.
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
import { fieldsOf } from "../lib/fields.mts";

/** One finished subagent, as the recording half left it. */
export interface Flag {
	/** Empty when the file carried no type; the reminder then names none. */
	readonly agentType: string;
}

/**
 * The agent type arrives bare from a user-level definition and plugin-scoped
 * ("den:<name>" or "plugin_den_<name>") from the den plugin; the bare name is
 * what a hook compares.
 */
export const bareType = (value: unknown): string =>
	String(value ?? "").replace(/^(den:|plugin_den_)/, "");

/**
 * Where a relay's pending flags wait: a directory of its own under the OS temp
 * directory, since every file in it is worthless once its reminder has been
 * injected. Both halves of a pair take the directory from here, so the half
 * that writes a flag and the half that reads it cannot name it differently.
 */
export const REVIEW_TRIAGE_DIR = join(tmpdir(), "claude-review-triage");
export const IMPLEMENTER_DIAGNOSTICS_DIR = join(
	tmpdir(),
	"claude-implementer-diagnostics",
);

export function raiseFlag(dir: string, input: Record<string, unknown>): void {
	const id = typeof input["agent_id"] === "string" ? input["agent_id"] : "";

	// agent_id is unique per subagent, which completes once, so it is both a
	// collision-free name and an idempotent one. A unique token stands in for
	// it if it is ever absent. Sanitized to keep it a safe filename.
	const name = (
		id || `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
	).replace(/[^A-Za-z0-9._-]/g, "_");

	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, `${name}.json`),
		// The type and nothing else: it is all the reminder names, and the id
		// is already the file's name.
		JSON.stringify({ agent_type: input["agent_type"] ?? "unknown" }),
	);
}

/** Every pending flag, with exactly the files they were read from deleted. */
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
