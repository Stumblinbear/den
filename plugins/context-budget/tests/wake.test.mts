// What a waiting run does next, from a reading built by hand and a clock
// passed in, so every rule of the decision is one row. What a reading takes
// off a transcript is `wake-reading.test.mts`, posting over the wire is
// `inbox.test.mts`, and the run that sleeps between the steps is
// `wake-arming.test.mts` and its neighbours.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Wake } from "../lib/settings.mts";
import { FRESH, nextStep, type Reading, type Stretch } from "../lib/wake.mts";
import { MINUTE } from "./fixtures.mts";

/** A fixed clock, so every time below is a plain offset from it. */
const NOW = Date.UTC(2026, 8, 12, 12, 0, 0);

const SECOND = 1000;

/** Two wakes over the hour, posted three minutes ahead; five over five minutes, posted 45 seconds ahead. */
const WAKE: Wake = {
	enabled: true,
	rows: {
		"1h": { times: 2, before: 3 * MINUTE },
		"5m": { times: 5, before: 45 * SECOND },
	},
	message: "",
};

/** One agent still running, the cache refreshed at `refreshedAt`, the last real turn an hour before it. */
const waiting = (
	refreshedAt: number,
	rest: Partial<Reading> = {},
): Reading => ({
	pending: [{ id: "agent-1", kind: "agent" }],
	lifetime: "1h",
	refreshedAt,
	turnedAt: refreshedAt - 60 * MINUTE,
	...rest,
});

test("nothing to keep warm is stop", () => {
	const fresh = waiting(NOW - 30 * MINUTE);

	assert.deepEqual(nextStep(FRESH, { ...fresh, pending: [] }, WAKE, NOW), {
		kind: "stop",
	});
	assert.deepEqual(
		nextStep(FRESH, fresh, { ...WAKE, enabled: false }, NOW),
		{ kind: "stop" },
		"the wake switched off",
	);
	assert.deepEqual(
		nextStep(FRESH, { ...fresh, refreshedAt: 0 }, WAKE, NOW),
		{ kind: "stop" },
		"no turn to measure from",
	);
	assert.deepEqual(
		nextStep(FRESH, { ...fresh, lifetime: null }, WAKE, NOW),
		{ kind: "stop" },
		"no turn wrote to the cache",
	);
	assert.deepEqual(
		nextStep(
			FRESH,
			fresh,
			{ ...WAKE, rows: { ...WAKE.rows, "1h": null } },
			NOW,
		),
		{ kind: "stop" },
		"the lifetime's row switched off",
	);
});

test("a cache already past its lifetime is stop", () => {
	assert.deepEqual(nextStep(FRESH, waiting(NOW - 60 * MINUTE), WAKE, NOW), {
		kind: "stop",
	});
	assert.deepEqual(nextStep(FRESH, waiting(NOW - 61 * MINUTE), WAKE, NOW), {
		kind: "stop",
	});
});

test("before the due moment the wait is the time to it", () => {
	// Refreshed a minute ago on 5m: due 45 seconds before the five are up.
	const step = nextStep(
		FRESH,
		waiting(NOW - MINUTE, { lifetime: "5m" }),
		WAKE,
		NOW,
	);

	assert.deepEqual(step, { kind: "wait", ms: 3 * MINUTE + 15 * SECOND });
});

test("a wait never exceeds the 5m row's due interval", () => {
	assert.deepEqual(nextStep(FRESH, waiting(NOW), WAKE, NOW), {
		kind: "wait",
		ms: 4 * MINUTE + 15 * SECOND,
	});
	assert.deepEqual(
		nextStep(
			FRESH,
			waiting(NOW),
			{ ...WAKE, rows: { ...WAKE.rows, "5m": null } },
			NOW,
		),
		{ kind: "wait", ms: 5 * MINUTE },
		"the 5m lifetime itself where that row is off",
	);
});

test("at the due moment the step is a post, counted", () => {
	assert.deepEqual(nextStep(FRESH, waiting(NOW - 57 * MINUTE), WAKE, NOW), {
		kind: "post",
		stretch: { spent: 1, lastPostAt: NOW },
		times: 2,
	});
	assert.equal(
		nextStep(FRESH, waiting(NOW - 58 * MINUTE), WAKE, NOW).kind,
		"post",
		"past the due moment and before expiry is still a post",
	);
});

// One wake posted an hour ago, answered three minutes later: the reply is the
// turn the cache was refreshed by, and the next wake falls due now.
const POSTED: Stretch = { spent: 1, lastPostAt: NOW - 60 * MINUTE };
const ANSWERED = waiting(NOW - 57 * MINUTE, {
	turnedAt: NOW - 3 * 60 * MINUTE,
});

test("a wake's own reply does not reset the count", () => {
	assert.deepEqual(nextStep(POSTED, ANSWERED, WAKE, NOW), {
		kind: "post",
		stretch: { spent: 2, lastPostAt: NOW },
		times: 2,
	});
});

// A run holds the stretch it has spent its wakes on: the reply to the last of
// them ends a turn, and the Stop on that turn would find the stretch free and
// start the count over.
test("the count spent is a wait, and the cache's expiry ends it", () => {
	const done: Stretch = { ...POSTED, spent: 2 };

	assert.deepEqual(nextStep(done, ANSWERED, WAKE, NOW), {
		kind: "wait",
		ms: 3 * MINUTE,
	});
	assert.deepEqual(
		nextStep(done, { ...ANSWERED, refreshedAt: NOW }, WAKE, NOW),
		{ kind: "wait", ms: 4 * MINUTE + 15 * SECOND },
		"and never past the bound",
	);
	assert.deepEqual(
		nextStep(done, waiting(NOW - 60 * MINUTE), WAKE, NOW),
		{ kind: "stop" },
		"the cache gone is the end of it",
	);
});

test("a real turn newer than the last post starts the count over", () => {
	const typed = { ...ANSWERED, turnedAt: NOW - 59 * MINUTE };

	assert.deepEqual(nextStep({ ...POSTED, spent: 2 }, typed, WAKE, NOW), {
		kind: "post",
		stretch: { spent: 1, lastPostAt: NOW },
		times: 2,
	});
});

test("a wake posted and not yet answered is waited on, not posted again", () => {
	const unanswered: Stretch = { spent: 1, lastPostAt: NOW - MINUTE };

	assert.deepEqual(
		nextStep(unanswered, waiting(NOW - 58 * MINUTE), WAKE, NOW),
		{ kind: "wait", ms: 2 * MINUTE },
		"until the cache expires, where the stretch ends",
	);
	assert.deepEqual(
		nextStep(unanswered, waiting(NOW - 50 * MINUTE), WAKE, NOW),
		{ kind: "wait", ms: 4 * MINUTE + 15 * SECOND },
		"and never past the bound",
	);
});
