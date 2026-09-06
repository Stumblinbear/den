// What ends the watcher's state: a compaction or a rewind, which replaces the
// conversation every part of that state was measured against. The record notes
// which context each count was taken in, and these are the cases that tell one
// context from the next. When the judge is consulted otherwise is
// `watcher-gate.test.mts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { runtimes } from "../../../tests/harness.mts";
import { fieldsOf } from "../lib/shared/fields.mts";
import {
	assistant,
	at,
	COMPACT_SUMMARY,
	compactBoundary,
	prompt as promptEntry,
} from "./fixtures.mts";
import { quiet, record } from "./harness.mts";
import {
	conversation,
	GOOD,
	injected,
	NOTICE,
	watcherRuns,
} from "./watcher-runs.mts";

for (const runtime of runtimes()) {
	const name = (what: string) => `${runtime}: ${what}`;

	// A verdict was judged against a conversation, and a compaction takes that
	// conversation out of the context. The next Stop reads a context named by a
	// prompt none of the ones it was judged against was, which is how it knows
	// what it is holding is about nothing.
	test(name("nothing stands once the context it was judged on is gone"), () => {
		const { judge, session, stop } = watcherRuns(runtime);
		const id = session();

		judge.answers(GOOD);
		assert.match(
			String(injected(stop(id, conversation(NOTICE, {}, 6)))),
			/Context watcher/,
		);

		quiet(stop(id, conversation(NOTICE, {}, 7)));
		assert.equal(judge.prompts().length, 1, "the verdict is standing");

		// The same session summarized: one prompt is left in the context, and
		// the six the verdict was judged against are above the boundary.
		const compacted = conversation(
			NOTICE,
			{},
			7,
			compactBoundary(),
			COMPACT_SUMMARY,
			promptEntry("Carry on from the summary", at(3), {
				uuid: "after-compaction",
			}),
			assistant(NOTICE, { minutesAgo: 1, uuid: "newest-after-compaction" }),
		);

		// The advice names the one turn the context has left, which is the walk
		// having stopped at the boundary.
		assert.match(
			String(injected(stop(id, compacted))),
			/began "Carry on from the summary"/,
			"a context nothing was judged on",
		);
	});

	// A compaction can land while the judge is still reading: the answer that
	// comes back is about a conversation the session no longer has, so it is
	// dropped whole rather than delivered against the context there now.
	test(name("an answer about a context that has gone is dropped"), () => {
		const { judge, session, stop } = watcherRuns(runtime);
		const id = session();
		const path = conversation(NOTICE);

		judge.answers(GOOD);
		judge.rewrites(path, COMPACTED);

		assert.equal(injected(stop(id, path)), null, "the answer is dropped");

		const watcher = fieldsOf(record(id)["watcher"]);

		assert.equal(watcher["verdict"], null, "no verdict was recorded");
		assert.equal(watcher["startedAt"], 0, "the claim is released");
	});

	// The prompt count cannot tell this on its own: a context rebuilt by a
	// compaction reaches the same rung again with more prompts in it than the
	// one the verdict was judged against ever had.
	test(name("a verdict does not stand in a context rebuilt past it"), () => {
		const { judge, session, stop } = watcherRuns(runtime);
		const id = session();

		judge.answers(GOOD);
		assert.match(
			String(injected(stop(id, conversation(NOTICE, {}, 3)))),
			/Context watcher/,
		);

		assert.match(
			String(injected(stop(id, rebuilt()))),
			/Context watcher/,
			"none of the prompts it was judged against are left",
		);
	});
}

/**
 * The same session after a compaction: the walk stops at the boundary, so the
 * oldest prompt of the context is one none of the prompts above it was.
 */
const COMPACTED: readonly string[] = [
	promptEntry("Read the brief and start on step 1", at(60), {
		uuid: "earlier-prompt-1",
	}),
	assistant(140_000, { minutesAgo: 60, uuid: "earlier-reply-1" }),
	compactBoundary(),
	COMPACT_SUMMARY,
	promptEntry("Carry on from the summary", at(3), { uuid: "after-compaction" }),
	assistant(NOTICE, { minutesAgo: 1, uuid: "newest-after-compaction" }),
];

/**
 * A three-prompt conversation compacted and grown back to five prompts at the
 * same rung, which is a context with more of the user's prompts in it than the
 * one a verdict was judged against and none of the same ones.
 */
function rebuilt(): string {
	const below: string[] = [compactBoundary(), COMPACT_SUMMARY];

	for (let n = 1; n <= 5; n += 1) {
		below.push(
			promptEntry(`Carry on from the summary, step ${n}`, at(6 - n), {
				uuid: `rebuilt-prompt-${n}`,
			}),
			assistant(NOTICE, { minutesAgo: 6 - n, uuid: `rebuilt-reply-${n}` }),
		);
	}

	return conversation(NOTICE, {}, 3, ...below);
}
