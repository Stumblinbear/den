// `hooks/config.example.toml` is the file users are told to copy, so it is run
// here exactly as `hooks.json` runs their copy of it. Nothing else loads it,
// and a key it leaves out or a value it spells wrong would otherwise first go
// wrong on a machine that is not this one.
//
// What the example's row says is the user's to rewrite, so nothing here reads
// its text. All the case checks is that a model it matches gets an injection.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { runtimes } from "../../../tests/harness.mts";
import { HOOKS, hookRunner, sessionId } from "./harness.mts";

const EXAMPLE = join(HOOKS, "config.example.toml");

/** The model id the example's one enabled row is written for. */
const OPUS = "claude-opus-5";

for (const runtime of runtimes()) {
	const run = hookRunner(runtime);

	test(`${runtime}: the example config injects for a model it matches`, () => {
		const result = run(
			{
				session_id: sessionId(runtime),
				hook_event_name: "SessionStart",
				session_start_reason: "startup",
				model: OPUS,
			},
			EXAMPLE,
		);

		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stderr, "");
		assert.ok(
			result.stdout.startsWith(`Rules for the current model (${OPUS}):`),
			result.stdout,
		);
	});
}
