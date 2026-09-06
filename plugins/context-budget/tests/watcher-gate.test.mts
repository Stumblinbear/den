// When the watcher consults its judge, which is the whole of what keeps a
// model call off most turns. Every step of the gate is a fact the record
// carries between two runs of the real entry, so each case runs the entry
// through the launcher and counts what the judge was handed.
//
// Nothing here reads the prompt: what is in it is `watcher-verdict.test.mts`,
// and how it is worded is nobody's assertion. What a compaction or a rewind
// ends is `watcher-context.test.mts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { runtimes } from "../../../tests/harness.mts";
import { quiet } from "./harness.mts";
import {
	COMMITTED,
	conversation,
	GOOD,
	injected,
	LATER,
	MIDPOINT,
	NOTICE,
	QUIET,
	URGENT,
	watcherRuns,
} from "./watcher-runs.mts";

/** A task marked completed, which is one of the two landing points. */
const COMPLETED = [
	{ name: "TaskUpdate", input: { task_id: "30", status: "completed" } },
];

for (const runtime of runtimes()) {
	const name = (what: string) => `${runtime}: ${what}`;

	test(name("the judge is consulted on the first turn past notice"), () => {
		const { judge, session, stop } = watcherRuns(runtime);

		judge.answers(LATER);
		quiet(stop(session(), conversation(NOTICE)));

		assert.equal(judge.prompts().length, 1);
	});

	// The two rungs the judge is never consulted on. Past urgent the hook's own
	// notice has already told the session to stop at the end of the step in
	// hand, which is what a verdict there would have said.
	test(name("the judge is left alone below notice and past urgent"), () => {
		const { judge, session, stop } = watcherRuns(runtime);

		judge.answers(LATER);
		quiet(stop(session(), conversation(QUIET)));
		quiet(stop(session(), conversation(URGENT)));

		assert.equal(judge.prompts().length, 0);
	});

	// A wait is counted in the user's own prompts, and the conversation carries
	// one more of them per turn: `later` is eight, so the tenth prompt of a
	// session first consulted on its second is the next one consulted.
	test(name("a wait of later holds the judge off for eight turns"), () => {
		const { judge, session, stop } = watcherRuns(runtime);
		const id = session();
		const turn = (turns: number) =>
			quiet(stop(id, conversation(NOTICE, {}, turns)));

		judge.answers(LATER);
		turn(2);
		assert.equal(judge.prompts().length, 1);

		for (let turns = 3; turns <= 9; turns += 1) {
			turn(turns);
		}

		assert.equal(judge.prompts().length, 1, "the wait has not run out");

		turn(10);
		assert.equal(judge.prompts().length, 2, "the tenth prompt is consulted");
	});

	// Past the midpoint the same answer buys half the wait, so the checks come
	// closer together as the room left between the thresholds runs down.
	test(name("past the midpoint that same wait is four turns"), () => {
		const { judge, session, stop } = watcherRuns(runtime);
		const id = session();
		const turn = (turns: number) =>
			quiet(stop(id, conversation(MIDPOINT, {}, turns)));

		judge.answers(LATER);
		turn(2);

		for (let turns = 3; turns <= 5; turns += 1) {
			turn(turns);
		}

		assert.equal(judge.prompts().length, 1, "the wait has not run out");

		turn(6);
		assert.equal(judge.prompts().length, 2, "the sixth prompt is consulted");
	});

	// A Stop is not a turn: the agent is woken again inside one turn by a
	// background notification, and a burst of those would otherwise run a wait
	// down with the user silent.
	test(name("a second Stop inside one turn is not a second turn"), () => {
		const { judge, session, stop } = watcherRuns(runtime);
		const id = session();
		const path = conversation(NOTICE);

		judge.answers({ good: false, wait: "next turn" });
		quiet(stop(id, path));
		assert.equal(judge.prompts().length, 1);

		quiet(stop(id, path));
		assert.equal(judge.prompts().length, 1, "the same turn, so the same wait");

		// The control: the wait is one turn, and the user's next prompt is one.
		quiet(stop(id, conversation(NOTICE, {}, 3)));
		assert.equal(judge.prompts().length, 2);
	});

	for (const [what, calls] of [
		["a completed task", COMPLETED],
		["a commit", COMMITTED],
	] as const) {
		test(name(`${what} cuts the wait short`), () => {
			const { judge, session, stop } = watcherRuns(runtime);
			const id = session();

			judge.answers(LATER);
			quiet(stop(id, conversation(NOTICE)));
			assert.equal(judge.prompts().length, 1);

			quiet(stop(id, conversation(NOTICE, { calls }, 3)));
			assert.equal(
				judge.prompts().length,
				2,
				"the wait had seven turns to run",
			);
		});
	}

	// The judge is asynchronous, so a Stop can arrive while one is still
	// running. The nested run below is that Stop: it is made from inside the
	// call, against the same record, and the marker in the record is what has
	// to stop it spending a second call on the same turn.
	test(name("the judge is not consulted while one is in flight"), () => {
		const { config, judge, session, stop } = watcherRuns(runtime);
		const id = session();
		const path = conversation(NOTICE);

		judge.answers(LATER);
		judge.nests(
			"watcher",
			{
				hook_event_name: "Stop",
				session_id: id,
				transcript_path: path,
			},
			config,
		);
		quiet(stop(id, path));

		assert.equal(judge.prompts().length, 1, "the nested Stop consulted none");

		// The control: the same gate opens for a Stop that lands a commit, so
		// the one call above was the marker and not the nesting.
		quiet(stop(id, conversation(NOTICE, { calls: COMMITTED }, 3)));

		assert.equal(judge.prompts().length, 2);
	});

	// A verdict the session has been told about is the watcher's silence: the
	// coordinator never says it declined, so nothing but a new signal reopens
	// the question, and a rung crossed is one.
	test(
		name("a delivered verdict stands until the level crosses a rung"),
		() => {
			const { judge, session, stop } = watcherRuns(runtime);
			const id = session();

			judge.answers(GOOD);
			assert.match(
				String(injected(stop(id, conversation(NOTICE)))),
				/Context watcher/,
			);

			quiet(stop(id, conversation(NOTICE, {}, 3)));
			assert.equal(judge.prompts().length, 1, "the verdict is standing");

			assert.match(
				String(injected(stop(id, conversation(MIDPOINT, {}, 4)))),
				/Context watcher/,
				"the midpoint is a new signal",
			);
		},
	);

	// The wait booked before an answer is spent by the answer: a verdict that
	// lands while a wait still has turns to run leaves the count it named behind
	// it, or the next rung the context climbs to reopens nothing.
	test(name("a rung climb reopens the question inside a booked wait"), () => {
		const { judge, session, stop } = watcherRuns(runtime);
		const id = session();

		judge.answers(LATER);
		quiet(stop(id, conversation(NOTICE)));
		assert.equal(judge.prompts().length, 1, "the eight-turn wait is booked");

		// The commit cuts that wait short, and this time the answer is a verdict.
		judge.answers(GOOD);
		assert.match(
			String(injected(stop(id, conversation(NOTICE, { calls: COMMITTED }, 3)))),
			/Context watcher/,
		);

		assert.match(
			String(injected(stop(id, conversation(MIDPOINT, {}, 4)))),
			/Context watcher/,
			"the midpoint is a new signal",
		);
	});

	test(name("enabled = false leaves the judge alone"), () => {
		const { judge, session, stop } = watcherRuns(runtime, {
			under: "enabled = false\n",
		});

		judge.answers(GOOD);
		quiet(stop(session(), conversation(NOTICE)));

		assert.equal(judge.prompts().length, 0);
	});
}
