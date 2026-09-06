// What the resume guard's cases share: the `SendMessage` a case runs through
// the launcher, and how the decision it writes is read back. Three files ask
// different things of one hook, and a deny read three different ways is three
// chances to assert on a shape the hook stopped writing. Importing this
// registers no test of its own.
import assert from "node:assert/strict";
import type { Result, Runtime } from "../../../tests/harness.mts";
import { hookRunner } from "./harness.mts";

/** The session transcript's one line: a prompt carrying no answer at all. */
export const PROMPT = JSON.stringify({
	type: "user",
	message: { role: "user", content: "carry on" },
});

interface Decision {
	readonly hookSpecificOutput?: {
		readonly permissionDecision?: string;
		readonly permissionDecisionReason?: string;
	};
}

/** The guard as `hooks.json` runs it, on one message to one subagent. */
export function guardRunner(
	runtime: Runtime,
): (session: string, transcript: string, to: string, config: string) => Result {
	const hook = hookRunner(runtime);

	return (session, transcript, to, config) =>
		hook(
			"resume-guard",
			{
				hook_event_name: "PreToolUse",
				tool_name: "SendMessage",
				session_id: session,
				tool_input: { to },
				transcript_path: transcript,
			},
			config,
		);
}

/** The decision a run wrote, and null for a run that allowed the resume. */
export function decided(result: Result): Decision["hookSpecificOutput"] | null {
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stderr, "");

	return result.stdout === ""
		? null
		: (JSON.parse(result.stdout) as Decision).hookSpecificOutput;
}

/** The filled message of a run that denied, and a failure of one that did not. */
export function reason(result: Result): string {
	const output = decided(result);

	assert.equal(
		output?.permissionDecision,
		"deny",
		"the call should have been denied",
	);

	return String(output?.permissionDecisionReason);
}
