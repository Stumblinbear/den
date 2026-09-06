// `hooks/config.example.toml` is the file users are told to copy, so it is run
// here exactly as `hooks.json` runs their copy of it. Nothing else loads it,
// and a key it leaves out or a value it spells wrong would otherwise first go
// wrong on a machine that is not this one.
//
// One run covers the whole file: the settings are checked in full before
// anything is measured, so a mistake anywhere in it is a fault on this run.
// What the example says is the user's to rewrite, so nothing here reads its
// wording. What a case asserts is that the threshold it sets is the one that
// fires.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parse } from "smol-toml";
import { type Result, runtimes } from "../../../tests/harness.mts";
import { fieldsOf } from "../lib/shared/fields.mts";
import { assistant } from "./fixtures.mts";
import { HOOKS, hookRunner, sessionId, transcript } from "./harness.mts";

const EXAMPLE = join(HOOKS, "config.example.toml");

/** The model id the example's `fable` row is written to match. */
const FABLE = "claude-fable-5-1";

interface Injection {
	readonly hookSpecificOutput?: { readonly additionalContext?: string };
}

const example = (): Record<string, unknown> =>
	fieldsOf(parse(readFileSync(EXAMPLE, "utf8")));

/** A threshold the example itself sets, so no case here can drift from it. */
function threshold(table: unknown, key: string, named: string): number {
	const value = fieldsOf(table)[key];

	assert.equal(typeof value, "number", `the example has to set ${named}`);

	return Number(value);
}

/** The example's `[default]` pair, which every model without a row takes. */
const fallback = () => example()["default"];

/** The example's `[models.'fable']` row, whose key has to match Fable's id. */
const fableRow = () => fieldsOf(example()["models"])["fable"];

function injected(result: Result): string | null {
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stderr, "");

	if (result.stdout === "") {
		return null;
	}

	const output = JSON.parse(result.stdout) as Injection;

	return output.hookSpecificOutput?.additionalContext ?? null;
}

for (const runtime of runtimes()) {
	const hook = hookRunner(runtime);
	const run = (tokens: number, model: string) =>
		hook(
			"context-budget",
			{
				hook_event_name: "UserPromptSubmit",
				session_id: sessionId(runtime),
				transcript_path: transcript(assistant(tokens, { model })),
			},
			EXAMPLE,
		);

	test(`${runtime}: the example config injects over its own threshold`, () => {
		// The threshold read here is `[default]`'s, so the turn names a model the
		// example has no row for; a row's own thresholds would apply instead.
		const notice = threshold(fallback(), "notice", "[default] notice");

		assert.equal(
			typeof injected(run(notice + 1000, "claude-opus-5")),
			"string",
			"the crossing has to inject something",
		);
	});

	// A row key that stopped matching the id the transcript records would hand
	// Fable the example's `[default]` thresholds without a word, and those sit
	// below the ones written for it.
	test(`${runtime}: the example's fable row governs Fable's own id`, () => {
		const row = fableRow();
		const notice = threshold(row, "notice", "[models.'fable'] notice");
		const urgent = threshold(row, "urgent", "[models.'fable'] urgent");
		// A context `[default]` speaks at and the row says nothing about, so
		// silence there is the row having governed. That window runs from
		// `[default]`'s notice up to the row's, and it closes if either number
		// moves toward the other.
		const between = threshold(fallback(), "notice", "[default] notice") + 1000;

		assert.ok(
			between < notice,
			`the row has to leave a window above [default]'s notice for this to prove anything: ${between} < ${notice}`,
		);
		assert.equal(
			injected(run(between, FABLE)),
			null,
			"past [default]'s notice and under the row's, which governs",
		);
		assert.equal(typeof injected(run(notice, FABLE)), "string");
		assert.equal(typeof injected(run(urgent, FABLE)), "string");
	});
}
