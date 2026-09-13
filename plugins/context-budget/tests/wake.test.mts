// What a waiting run does next, from a reading built by hand and a clock
// passed in, so every rule of the decision is one row; then what a reading
// takes off a transcript, and what its walk of the file leaves out. Posting
// over the wire is `inbox.test.mts`, and the run that sleeps between steps is
// the entry's.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Wake } from "../lib/settings.mts";
import {
	FRESH,
	nextStep,
	type Reading,
	reading,
	type Stretch,
} from "../lib/wake.mts";
import {
	agentLaunch,
	backgroundBash,
	taskNotification,
} from "./background-fixtures.mts";
import {
	apiError,
	assistant,
	at,
	COMPACT_SUMMARY,
	compactBoundary,
	crossSessionMessage,
	MINUTE,
	prompt,
} from "./fixtures.mts";
import { transcript } from "./harness.mts";

/** A fixed clock, so every time below is a plain offset from it. */
const NOW = Date.UTC(2026, 8, 12, 12, 0, 0);

const SECOND = 1000;

/**
 * Asserts `actual` is the time a fixture stamped `minutesAgo` ago, within the
 * moment or two the test itself took.
 */
function near(actual: number, minutesAgo: number, what: string): void {
	const drift = Math.abs(actual - (Date.now() - minutesAgo * MINUTE));

	assert.ok(drift < 5 * SECOND, `${what}: off by ${drift}ms`);
}

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

test("the count spent is stop", () => {
	assert.deepEqual(nextStep({ ...POSTED, spent: 2 }, ANSWERED, WAKE, NOW), {
		kind: "stop",
	});
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

test("a reading takes its times off the newest turn and the newest real turn", () => {
	const path = transcript(
		prompt("Launch it", at(20)),
		agentLaunch("agent-1", at(19)),
		assistant(50_000, { minutesAgo: 18, ttl: "1h" }),
		assistant(50_500, { minutesAgo: 10, ttl: null }),
		apiError({ minutesAgo: 5 }),
	);
	const read = reading(path);

	assert.deepEqual(read.pending, [{ id: "agent-1", kind: "agent" }]);
	assert.equal(read.lifetime, "1h", "from the newest turn that wrote");
	near(read.refreshedAt, 10, "the failed request is no turn");
	near(read.turnedAt, 20, "the prompt");
});

test("a notification is a real turn, and the wake it answers is not", () => {
	const path = transcript(
		prompt("Launch two", at(90)),
		agentLaunch("agent-1", at(89)),
		agentLaunch("agent-2", at(88)),
		assistant(50_000, { minutesAgo: 87 }),
		crossSessionMessage(
			"Cache wake 1 of 2: 2 background tasks still running",
			at(30),
		),
		assistant(50_500, { minutesAgo: 29 }),
		taskNotification("agent-1", at(8)),
		assistant(51_000, { minutesAgo: 7 }),
	);
	const read = reading(path);

	assert.deepEqual(read.pending, [{ id: "agent-2", kind: "agent" }]);
	near(read.turnedAt, 8, "the notification");
	near(read.refreshedAt, 7, "the turn after it");

	const beforeIt = reading(
		transcript(
			prompt("Launch one", at(90)),
			agentLaunch("agent-1", at(89)),
			assistant(50_000, { minutesAgo: 87 }),
			crossSessionMessage(
				"Cache wake 1 of 2: 1 background task still running",
				at(30),
			),
			assistant(50_500, { minutesAgo: 29 }),
		),
	);

	near(beforeIt.turnedAt, 90, "the wake is not a turn");
	near(beforeIt.refreshedAt, 29, "its reply refreshed the cache");
});

test("a launch above a compaction is not read", () => {
	const path = transcript(
		agentLaunch("before", at(30)),
		compactBoundary({ minutesAgo: 20 }),
		COMPACT_SUMMARY,
		agentLaunch("after", at(10)),
		assistant(20_000, { minutesAgo: 9 }),
	);

	assert.deepEqual(reading(path).pending, [{ id: "after", kind: "agent" }]);
});

test("a subagent's own launches are not this conversation's", () => {
	const path = transcript(
		agentLaunch("theirs", at(10), { isSidechain: true }),
		backgroundBash("ours", at(9)),
	);

	assert.deepEqual(reading(path).pending, [{ id: "ours", kind: "bash" }]);
});

// One entry the harness stamped badly is not the cache gone cold: the turn
// below it refreshed the cache all the same, and that is the one to read.
test("an entry whose timestamp will not parse is passed over", () => {
	const unstamped = (line: string) =>
		JSON.stringify({ ...JSON.parse(line), timestamp: "not a time" });
	const path = transcript(
		prompt("Launch it", at(20)),
		agentLaunch("agent-1", at(19)),
		assistant(50_000, { minutesAgo: 18 }),
		unstamped(assistant(50_500, { minutesAgo: 10 })),
	);
	const read = reading(path);

	near(read.refreshedAt, 18, "the turn below the bad stamp");
	assert.equal(read.lifetime, "1h", "which the bad stamp says nothing about");
});

test("a context with no turn in it reads as none", () => {
	const read = reading(transcript(prompt("Nothing answered yet", at(1))));

	assert.deepEqual(read.pending, []);
	assert.equal(read.lifetime, null);
	assert.equal(read.refreshedAt, 0);
	near(read.turnedAt, 1, "the prompt is a real turn all the same");
});
