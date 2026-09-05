// `hooks/config.example.toml` is the file users are told to copy, so it is run
// here exactly as `hooks.json` runs their copy of it. Nothing else loads it,
// and a key it leaves out or a value it spells wrong would otherwise first go
// wrong on a machine that is not this one.
//
// One run covers the whole file: the settings are checked in full before
// anything is measured, so a mistake anywhere in it is a fault on this run.
// What the example says is the user's to rewrite, so nothing here reads its
// wording -- only that the threshold it sets is the one that fires.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parse } from "smol-toml";
import { runtimes } from "../../../tests/harness.mts";
import { fieldsOf } from "../lib/fields.mts";
import {
	assistantTurn,
	HOOKS,
	hookRunner,
	sessionId,
	transcript,
} from "./harness.mts";

const EXAMPLE = join(HOOKS, "config.example.toml");

interface Injection {
	readonly hookSpecificOutput?: { readonly additionalContext?: string };
}

/** The example's own `[default] notice`, so no case here can drift from it. */
function noticeThreshold(): number {
	const table = fieldsOf(parse(readFileSync(EXAMPLE, "utf8")));
	const notice = fieldsOf(table["default"])["notice"];

	assert.equal(
		typeof notice,
		"number",
		"the example has to set [default] notice",
	);

	return Number(notice);
}

for (const runtime of runtimes()) {
	const hook = hookRunner(runtime);

	test(`${runtime}: the example config injects over its own threshold`, () => {
		const result = hook(
			"context-budget",
			{
				hook_event_name: "UserPromptSubmit",
				session_id: sessionId(runtime),
				transcript_path: transcript(assistantTurn(noticeThreshold() + 1000)),
			},
			EXAMPLE,
		);

		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stderr, "");
		assert.notEqual(result.stdout, "", "the crossing has to inject something");

		const output = JSON.parse(result.stdout) as Injection;

		assert.equal(
			typeof output.hookSpecificOutput?.additionalContext,
			"string",
			result.stdout,
		);
	});
}
