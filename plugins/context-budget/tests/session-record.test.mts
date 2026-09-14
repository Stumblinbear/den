// The one file a session leaves behind, and everything that reads or writes
// it: the measurement hook writes the level it announced into it, the resume
// guard spends answers in it, and the watcher paces its judge by it. None of
// them knows the others' fields, so what any of them writes must leave the
// rest of the file where it was. There must be exactly one file too, since a
// second is a second place to look and a second thing to delete.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { test } from "node:test";
import { type Result, runtimes } from "../../../tests/harness.mts";
import { assistant } from "./fixtures.mts";
import {
	configFile,
	hookRunner,
	record,
	reported,
	sessionId,
	stateFiles,
	transcript,
	USABLE,
} from "./harness.mts";

interface Injection {
	readonly hookSpecificOutput?: { readonly additionalContext?: string };
}

/** A file that parses and is missing everything but `[default]`. */
const NO_MESSAGES = "[default]\nnotice = 1\nurgent = 2\n";

function injected(result: Result): string | null {
	assert.equal(result.status, 0, result.stderr);

	if (result.stdout === "") {
		return null;
	}

	const output = JSON.parse(result.stdout) as Injection;

	return output.hookSpecificOutput?.additionalContext ?? null;
}

for (const runtime of runtimes()) {
	const hook = hookRunner(runtime);
	const sid = () => sessionId(runtime);
	const name = (what: string) => `${runtime}: ${what}`;
	const inject = (session: string, path: string, config: string) =>
		hook(
			"context-budget",
			{
				hook_event_name: "UserPromptSubmit",
				session_id: session,
				transcript_path: path,
			},
			config,
		);

	// A run stopped by a fault has done none of the work the record is written
	// from, so what an earlier run measured is what the session still knows.
	test(name("a run stopped by a fault leaves the record where it was"), () => {
		const session = sid();
		const path = configFile(USABLE);
		const measured = transcript(assistant(200_000));

		assert.equal(
			injected(inject(session, measured, path)),
			"NOTICE 200K over 150K",
		);

		writeFileSync(path, NO_MESSAGES);
		reported(inject(session, measured, path), "config");

		assert.deepEqual(stateFiles(session), [`${session}.json`]);
		assert.equal(
			record(session)["level"],
			"notice",
			"the level already posted survives",
		);
	});

	// The level is written by the run that changes it, so a session that has
	// never crossed a threshold has nothing to record and no file to hold it.
	test(name("a run below every threshold leaves no record behind"), () => {
		const session = sid();
		const path = transcript(assistant(50_000));

		assert.equal(
			injected(inject(session, path, configFile(USABLE))),
			null,
			"50K is under 150K",
		);
		assert.deepEqual(
			stateFiles(session),
			[],
			"nothing changed, so nothing is written",
		);
	});
}
