// What one check reads off a transcript: the work still pending, the lifetime
// in force, when the cache was last refreshed, when the session last moved on
// its own, and what the walk of the file leaves out. What a run does with a
// reading is `wake.test.mts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { reading } from "../lib/wake.mts";
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

const SECOND = 1000;

/**
 * Asserts `actual` is the time a fixture stamped `minutesAgo` ago, to within
 * the moment or two the test itself took.
 */
function near(actual: number, minutesAgo: number, what: string): void {
	const drift = Math.abs(actual - (Date.now() - minutesAgo * MINUTE));

	assert.ok(drift < 5 * SECOND, `${what}: off by ${drift}ms`);
}

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

// One badly stamped entry is not the cache gone cold: the turn below it
// refreshed the cache all the same, and that is the one to read.
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
