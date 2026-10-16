// The flag relay den's two triage hook pairs share: a subagent's hand-back
// leaves a flag file named by the subagent's id, and the prompt that delivers
// its report turns that flag into a reminder.
//
// - `raiseFlag` records a hand-back, from a PreToolUse hook on
//   `SubagentHandback`, the tool a subagent delivers its report with.
// - `takeFlag` reads one sender's flag back, from a UserPromptSubmit hook that
//   reads the sender from its prompt (see `lib/hand-back.mts`).
// - `reviewTriageDir` and `implementerTriageDir` name each relay's directory.
//
// A relay takes two hooks because one that runs in the subagent cannot write
// into the lead's context: its additionalContext goes to the subagent, and a
// UserPromptSubmit hook's lands with the lead.
//
// Claude Code 2.1.301 runs the two in order. The PreToolUse hook completes
// before the tool does, and the delivered report then fires the lead's
// UserPromptSubmit with the report as its prompt, which takes the flag: at once
// when the lead is idle, and at its next tool boundary or its stop when it is
// mid-turn. So the flag is on disk before the hook that takes it runs. The
// subagent's SubagentStop fires after that hook, too late to raise the flag. A
// subagent inside a workflow reports to the workflow's script and ends with no
// hand-back, so it raises no flag.
//
// A flag hook never fails loudly: it runs before the hand-back, and a
// PreToolUse failure that blocked the tool would keep the report from the lead.
//
// Every triage reminder the UserPromptSubmit hooks give asks the lead to invoke
// `den:triage` rather than restating its rules, so the rules load at the moment
// they apply.
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fieldsOf } from "./shared/fields.mts";

/** A pending hand-back, as its flag file recorded it. */
export interface Flag {
	/** Empty when the file carried no type; the reminder then names none. */
	readonly agentType: string;
}

/**
 * The directory this session's pending review-triage flags wait in.
 *
 * @remarks
 * Both hooks of the relay take the directory from here, and the input's
 * `session_id` alone names it. A subagent's PreToolUse carries the lead's
 * session id, the same one the lead's next UserPromptSubmit carries; a session
 * where the two differ gets a reminder from neither relay, and no error.
 *
 * @param input - a hook input, read for `session_id`
 * @returns null when the input carries no session id, since a flag nobody
 * could read back is not worth writing
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

/**
 * One relay's flag directory for one session: under the OS temp directory,
 * since every file in it is worthless once its reminder has been injected,
 * and under a subdirectory per session, since the temp directory is the
 * machine's and a flag another session's agent left would otherwise be
 * announced here.
 */
function triageDir(
	relay: string,
	input: Record<string, unknown>,
): string | null {
	const session = input["session_id"];
	if (typeof session !== "string" || session === "") {
		return null;
	}
	// The id is a directory component, so no dot survives: `..` would resolve
	// the relay to the temp directory itself, and flags would then be written
	// and deleted there. Claude Code's ids are hex and hyphens, so nothing real
	// is rewritten.
	return join(tmpdir(), relay, session.replace(/[^A-Za-z0-9_-]/g, "_"));
}

/**
 * Records a hand-back from one of `agentTypes` as a flag in `dir`.
 *
 * @remarks
 * A hand-back whose `agent_type` is missing or outside `agentTypes`, or that
 * carries no `agent_id`, writes nothing, since {@link takeFlag} finds a flag
 * by its agent's id.
 *
 * @param dir - the relay's directory, created when missing
 * @param input - a PreToolUse hook input, read for `agent_type` and `agent_id`
 * @param agentTypes - the agent types the relay flags, its only filter, since
 * `hooks.json` matches a flag hook to the `SubagentHandback` tool and every
 * agent's hand-back reaches it
 * @throws when the directory or the flag file cannot be written
 */
export function raiseFlag(
	dir: string,
	input: Record<string, unknown>,
	agentTypes: ReadonlySet<string>,
): void {
	const type = input["agent_type"];
	const id = input["agent_id"];

	if (typeof type !== "string" || !agentTypes.has(type)) {
		return;
	}

	if (typeof id !== "string" || id === "") {
		return;
	}

	mkdirSync(dir, { recursive: true });
	writeFileSync(
		flagPath(dir, id),
		// The type and nothing else: it is all the reminder names, and the id
		// is already the file's name.
		JSON.stringify({ agent_type: type }),
	);
}

/**
 * The flag `agentId` left in `dir`, whose file is deleted once read.
 *
 * @returns null when that agent left no flag, and when its file does not
 * parse, which is deleted all the same
 */
export function takeFlag(dir: string, agentId: string): Flag | null {
	const path = flagPath(dir, agentId);
	let text: string;

	try {
		text = readFileSync(path, "utf8");
	} catch {
		// No flag: the sender is no agent this relay flags.
		return null;
	}

	try {
		unlinkSync(path);
	} catch {
		// Already claimed by a concurrent injector, which is harmless.
	}

	try {
		return flagIn(JSON.parse(text));
	} catch {
		// Half-written: no reminder for it.
		return null;
	}
}

/** The file in `dir` that holds `agentId`'s flag. */
function flagPath(dir: string, agentId: string): string {
	// One file per agent: reviewers and implementers routinely hand back at
	// once, and hooks racing on a shared file would lose entries. An agent
	// hands back once, so its name never collides. The id is a file name, so
	// no separator survives; the suffix keeps a bare `..` from naming the
	// directory's parent.
	return join(dir, `${agentId.replace(/[^A-Za-z0-9._-]/g, "_")}.json`);
}

function flagIn(parsed: unknown): Flag {
	const type = fieldsOf(parsed)["agent_type"];

	return { agentType: typeof type === "string" ? type : "" };
}
