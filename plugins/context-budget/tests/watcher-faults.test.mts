// What the watcher's own failures cost the session: a report for a judge that
// failed rather than answered, and silence for everything else. The watcher
// advises, so a missing answer costs the session nothing; a judge that never
// answers is a watcher the user believes is watching, and a line they can act
// on.
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
	test(`${runtime}: a judge that will not start is reported on every Stop that reaches it`, () => {
		const { session, stop } = watcherRuns(runtime, { command: MISSING });
		const id = session();

		reported(stop(id, conversation(NOTICE)));

		const watcher = fieldsOf(record(id)["watcher"]);

		assert.equal(watcher["startedAt"], 0, "the call is not left in flight");
		assert.ok(
			Number(watcher["next"]) > Number(watcher["turn"]),
			`a wait is booked against the same command: ${JSON.stringify(watcher)}`,
		);

		// A commit cuts that wait short, so the judge is reached for a second
		// time and fails for a second time, and the session hears it again: the
		// Stop is the end of a turn, so a report on each of them is one a turn.
		reported(stop(id, conversation(NOTICE, { calls: COMMITTED }, 3)));
	});

	// A failed `claude -p` call exits 1 with its whole envelope on stdout, so
	// nothing about the exit or the empty stdout of a judge that never started
	// is there to read it by. `is_error` is, and `subtype` stays "success"
	// through it. The fixture judge exits 0, which is what pins the reading to
	// the field rather than to the status.
	test(`${runtime}: a judge that ran and failed is reported`, () => {
		const { judge, session, stop } = watcherRuns(runtime);
		const id = session();

		judge.answers({
			is_error: true,
			subtype: "success",
			terminal_reason: "api_error",
			result: "API Error: 500 upstream connect error.",
		});

		reported(stop(id, conversation(NOTICE)));

		const watcher = fieldsOf(record(id)["watcher"]);

		assert.equal(watcher["startedAt"], 0, "the call is not left in flight");
		assert.ok(
			Number(watcher["next"]) > Number(watcher["turn"]),
			`a wait is booked against the same command: ${JSON.stringify(watcher)}`,
		);
	});

	// A `command` of the user's own is handed no schema and writes whatever it
	// writes, so a judge answering badly stays silence: what marks a failed call
	// is a field only the CLI writes.
	test(`${runtime}: an answer with nothing in it to act on is not a fault`, () => {
		const { judge, session, stop } = watcherRuns(runtime);
		const id = session();

		judge.answers({ subtype: "success", result: "I could not decide." });
		quiet(stop(id, conversation(NOTICE)));
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
