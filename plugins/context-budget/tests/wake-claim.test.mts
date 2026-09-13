// One waiter per session. A session can end several turns while its background
// work runs, and each Stop starts an entry of its own; the lock beside the
// session record makes all but the first give up, so one idle stretch is one
// run posting one series of wakes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { runtimes } from "../../../tests/harness.mts";
import { endedWithin, finished, idling, wakeRuns } from "./wake-runs.mts";

for (const runtime of runtimes()) {
	const name = (what: string) => `${runtime}: ${what}`;

	test(
		name("a second Stop leaves the stretch to the run that has it"),
		async () => {
			const runs = await wakeRuns(runtime);

			try {
				const session = runs.session();
				const path = idling();
				const waiting = runs.start(session, path);

				// The first wake on the wire is this run holding the stretch: it has
				// the lock, and it is inside the loop rather than on its way to it.
				await runs.inbox.received(2);

				const second = await endedWithin(
					runs.start(session, path),
					"the second Stop",
				);

				assert.equal(second.status, 0, second.stderr);
				assert.equal(second.stderr, "", "nothing on stderr");
				assert.equal(second.stdout, "", "nothing for the agent");
				assert.equal(
					runs.inbox.lines().length,
					2,
					"the second Stop posted nothing",
				);

				// What the waiting run ends on.
				finished(path);

				const ended = await endedWithin(waiting, "the waiting run");

				assert.equal(ended.status, 0, ended.stderr);
				assert.equal(ended.stderr, "", "nothing on stderr");
				assert.equal(runs.inbox.lines().length, 2, "and no wake after it");
			} finally {
				await runs.close();
			}
		},
	);
}
