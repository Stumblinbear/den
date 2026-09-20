// When a wake is posted, and what ends the run that posts it. What a wake says
// is not read.
//
// The runs below are real entries driven through both wakes their row allows.
// The first message is what a session receives, the second is the count rising
// over a turn the wake itself caused, and a run whose count is spent holds the
// stretch rather than leaving it to the next Stop.
import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { runtimes } from "../../../tests/harness.mts";
import {
	endedWithin,
	finished,
	idling,
	WAKE_OFF,
	WAKE_UNSPENT,
	wakeRuns,
	woken,
} from "./wake-runs.mts";

/**
 * The `nth` posted message as its reader sees it: the text inside the frame's
 * wrapper, with the auth line of the connection skipped, asserted not to be
 * empty. The frame and the wrapper themselves are `inbox.test.mts`.
 */
function posted(lines: readonly string[], nth: number): string {
	const frame = JSON.parse(String(lines[nth * 2 + 1])) as {
		readonly message?: { readonly content?: string };
	};
	const text = String(frame.message?.content)
		.split("\n")
		.slice(1, -1)
		.join("\n");

	assert.notEqual(text.trim(), "", "the wake is empty");

	return text;
}

for (const runtime of runtimes()) {
	const name = (what: string) => `${runtime}: ${what}`;

	test(
		name("the wakes of one stretch, and the run that ends with them"),
		async () => {
			const runs = await wakeRuns(runtime);

			try {
				const path = idling();
				const waiting = runs.start(runs.session(), path);
				const first = posted(await runs.inbox.received(2), 0);

				// The session takes the turn the wake asked for, which refreshes
				// the cache and brings the next wake due a second later.
				woken(path, first);
				posted(await runs.inbox.received(4), 1);

				// A run with its count spent holds the stretch to the cache's
				// expiry, so what ends this one is the work finishing under it.
				finished(path);

				const ended = await endedWithin(
					waiting,
					"the run that spent its count",
				);

				assert.equal(ended.status, 0, ended.stderr);
				assert.equal(ended.stderr, "", "nothing on stderr");
				assert.equal(ended.stdout, "", "nothing for the agent");
				assert.equal(
					runs.inbox.lines().length,
					4,
					"no third wake against the count",
				);
			} finally {
				await runs.close();
			}
		},
	);

	// The reply to the last wake ends a turn like any other, so Claude Code
	// runs a Stop on it and that Stop starts an entry of its own. The lock is
	// what keeps that entry from opening a count of its own; see `nextStep` for
	// what a run whose wakes are spent goes on waiting for.
	test(
		name("the Stop the last wake's own reply fires posts nothing"),
		async () => {
			const runs = await wakeRuns(runtime);

			try {
				const session = runs.session();
				const path = idling();
				const waiting = runs.start(session, path);

				woken(path, posted(await runs.inbox.received(2), 0));

				const second = posted(await runs.inbox.received(4), 1);

				// The reply's Stop runs whether the spent run is out of the way by
				// then or still holding the stretch.
				await Promise.race([waiting.ended(), sleep(2_000)]);
				woken(path, second);

				const again = runs.start(session, path);

				await sleep(3_000);

				const onTheWire = runs.inbox.lines().length;

				finished(path);
				await endedWithin(again, "the Stop after the last reply");
				await endedWithin(waiting, "the run that spent the count");
				assert.equal(onTheWire, 4, "no wake beyond the count");
			} finally {
				await runs.close();
			}
		},
	);

	// A [wake] edit lands mid-stretch, since the file is read at every check
	// rather than once per run. The run is switched off between its first wake
	// and the reply that answers it, and ends there with a wake still in its
	// row.
	test(name("a [wake] edit reaches the run already waiting"), async () => {
		const runs = await wakeRuns(runtime);

		try {
			const path = idling();
			const waiting = runs.start(runs.session(), path);
			const first = posted(await runs.inbox.received(2), 0);

			runs.reconfigure(WAKE_OFF);
			woken(path, first);

			const ended = await endedWithin(
				waiting,
				"the run switched off mid-stretch",
			);

			assert.equal(ended.status, 0, ended.stderr);
			assert.equal(ended.stderr, "", "nothing on stderr");
			assert.equal(runs.inbox.lines().length, 2, "no wake after the edit");
		} finally {
			await runs.close();
		}
	});

	// The likeliest end of a stretch: the user closes Claude Code while the
	// background work is still going, and the run outlives the session it was
	// keeping warm. The row here has wakes left, so a run that took a refused
	// post for nothing in particular would post again at once, and again.
	test(name("a session that has gone takes the stretch with it"), async () => {
		const runs = await wakeRuns(runtime, WAKE_UNSPENT);

		try {
			const path = idling();
			const waiting = runs.start(runs.session(), path);
			const first = posted(await runs.inbox.received(2), 0);

			await runs.close();
			woken(path, first);

			const ended = await endedWithin(
				waiting,
				"the run whose session had gone",
			);

			assert.equal(ended.status, 0, ended.stderr);
			assert.equal(ended.stderr, "", "nothing on stderr");
			assert.equal(ended.stdout, "", "nothing for the agent");
		} finally {
			await runs.close();
		}
	});

	// What every other case's bound rests on: `endedWithin` kills a run that
	// overran, and the entry under the launcher has to go with it. This row has
	// wakes left, so nothing else ends this run; a kill that reached only the
	// launcher leaves the case waiting on the entry.
	test(name("a killed run takes the waiting entry with it"), async () => {
		const runs = await wakeRuns(runtime, WAKE_UNSPENT);

		try {
			const waiting = runs.start(runs.session(), idling());

			await runs.inbox.received(2);
			waiting.kill();

			const ended = await endedWithin(waiting, "the killed run");

			assert.equal(ended.status, null, "a killed run has no status");
		} finally {
			await runs.close();
		}
	});
}
