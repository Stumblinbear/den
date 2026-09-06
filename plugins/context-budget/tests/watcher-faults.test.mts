// What the watcher's own failures cost the session: one line for a `command`
// nothing can start, and silence for everything else. The watcher advises, so a
// missing answer costs the session nothing; a judge that never runs at all is a
// watcher the user believes is watching, and a line they can fix.
//
// That one line is reported as this entry's own fault, so no prompt run of the
// measurement hook takes it back: what the measurement hook proves by working
// is that the file parsed, and the command in it is what did not run.
import assert from "node:assert/strict";
import { test } from "node:test";
import { runtimes } from "../../../tests/harness.mts";
import { fieldsOf } from "../lib/shared/fields.mts";
import { quiet, record, reported } from "./harness.mts";
import {
	COMMITTED,
	conversation,
	NOTICE,
	watcherRuns,
} from "./watcher-runs.mts";

/** A first word no PATH holds, which is the shape a mistyped `command` takes. */
const MISSING: readonly string[] = ["no-such-judge-context-budget", "-p"];

for (const runtime of runtimes()) {
	test(`${runtime}: a judge that will not start is said once`, () => {
		const { session, stop } = watcherRuns(runtime, { command: MISSING });
		const id = session();
		const said = reported(stop(id, conversation(NOTICE)), "internal");

		assert.ok(said.includes("no-such-judge-context-budget"), said);
		assert.ok(said.includes("The watcher is off for this session"), said);

		const watcher = fieldsOf(record(id)["watcher"]);

		assert.equal(watcher["startedAt"], 0, "the call is not left in flight");
		assert.ok(
			Number(watcher["next"]) > Number(watcher["turn"]),
			`a wait is booked against the same command: ${JSON.stringify(watcher)}`,
		);

		// A commit cuts that wait short, so the judge is reached for a second
		// time and fails for a second time, which the session has already heard.
		quiet(stop(id, conversation(NOTICE, { calls: COMMITTED }, 3)));
	});

	// A judge that ran and wrote something no verdict can be read out of is one
	// every turn would otherwise spend a call on, so it books the longest wait
	// rather than the shortest: the conversation is two prompts, and `later` is
	// eight of them.
	test(`${runtime}: an answer that will not parse books the longest wait`, () => {
		const { judge, session, stop } = watcherRuns(runtime);
		const id = session();

		judge.answers("not json");
		quiet(stop(id, conversation(NOTICE)));

		const watcher = fieldsOf(record(id)["watcher"]);

		assert.equal(watcher["turn"], 2, "the two prompts of the conversation");
		assert.equal(watcher["next"], 10, "eight turns past this one");
		assert.equal(watcher["verdict"], null, "nothing usable came back");
	});
}
