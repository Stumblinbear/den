// Which background work a run of entries shows still running: each launch
// shape Claude Code writes, the notification that ends one, and what is no
// launch at all. The entries are handed over as `contextEntries` yields them,
// newest first, so no test here touches a file. The walk that reads a file is
// `wake.test.mts`, under the reading built on it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { agentRunning, pending, taskNotification } from "../lib/background.mts";
import { entryIn } from "../lib/transcript.mts";
import {
	agentLaunch,
	agentResume,
	backgroundBash,
	forkedSkill,
	taskNotification as notified,
	taskStop,
	workflowLaunch,
} from "./background-fixtures.mts";
import { assistant, at, prompt, toolResult } from "./fixtures.mts";

const entry = (line: string) => {
	const parsed = entryIn(line);

	assert.ok(parsed, "the fixture is an entry");

	return parsed;
};

/** Lines written oldest first, as a transcript is, handed over newest first. */
const context = (...lines: readonly string[]) => lines.map(entry).reverse();

test("each launch shape is read by its id, oldest first", () => {
	const entries = context(
		prompt("Run the five of them", at(10)),
		agentLaunch("agent-one", at(9)),
		backgroundBash("bash-started", at(8)),
		backgroundBash("bash-moved", at(7), "moved"),
		agentResume("agent-two", at(6)),
		workflowLaunch("workflow-one", at(5)),
		forkedSkill("agent-three", at(4)),
		assistant(50_000, { minutesAgo: 3 }),
	);

	assert.deepEqual(pending(entries), [
		{ id: "agent-one", kind: "agent" },
		{ id: "bash-started", kind: "bash" },
		{ id: "bash-moved", kind: "bash" },
		{ id: "agent-two", kind: "agent" },
		{ id: "workflow-one", kind: "workflow" },
		{ id: "agent-three", kind: "agent" },
	]);
});

test("a resumed agent is pending work, ended by its next notification", () => {
	const resumed = context(
		agentLaunch("agent-one", at(30)),
		assistant(50_000, { minutesAgo: 29 }),
		notified("agent-one", at(20)),
		assistant(51_000, { minutesAgo: 19 }),
		agentResume("agent-one", at(10)),
		assistant(52_000, { minutesAgo: 9 }),
	);

	assert.deepEqual(
		pending(resumed),
		[{ id: "agent-one", kind: "agent" }],
		"launched, notified and resumed is running again, and once",
	);

	const finished = context(
		agentLaunch("agent-one", at(30)),
		notified("agent-one", at(20)),
		agentResume("agent-one", at(10)),
		notified("agent-one", at(5)),
		assistant(52_000, { minutesAgo: 4 }),
	);

	assert.deepEqual(pending(finished), [], "the second notification ends it");
});

// Each line added to this history flips the answer, since the newest entry
// naming the agent decides, and the entries of the agent beside it never do.
test("the newest entry naming an agent says whether it is running", () => {
	const history = [
		agentLaunch("agent-one", at(30)),
		notified("agent-one", at(20), "queued"),
		agentResume("agent-one", at(10)),
		taskStop("agent-one", at(5), "local_agent"),
	];
	const running = [true, false, true, false];

	for (const [i, expected] of running.entries()) {
		const entries = context(
			agentLaunch("agent-two", at(40)),
			...history.slice(0, i + 1),
			notified("agent-two", at(1)),
		);

		assert.equal(agentRunning(entries, "agent-one"), expected, `line ${i}`);
	}

	assert.equal(
		agentRunning(context(backgroundBash("agent-one", at(5))), "agent-one"),
		false,
		"a command under that id is no agent",
	);
	assert.equal(
		agentRunning(context(prompt("Nothing", at(1))), "agent-one"),
		false,
	);
});

// A notification that arrives mid-turn is never written as a user entry, so
// a walk that read only those would carry the launch as pending for the rest
// of the context and wake the session for work that is done.
test("a completion delivered mid-turn ends its launch", () => {
	const entries = context(
		prompt("Launch three", at(30)),
		agentLaunch("idle", at(29)),
		agentLaunch("queued", at(28)),
		agentLaunch("attached", at(27)),
		assistant(50_000, { minutesAgo: 26 }),
		notified("queued", at(20), "queued"),
		notified("attached", at(19), "attached"),
		notified("idle", at(10)),
		assistant(51_000, { minutesAgo: 9 }),
	);

	assert.deepEqual(pending(entries), []);
});

// A command stopped by `TaskStop` writes no notification of any kind, so the
// stop is the only end it has; an agent stopped that way notifies as well, and
// reading the stop for both is one rule rather than two.
test("a TaskStop ends the task it names", () => {
	const entries = context(
		backgroundBash("bash-one", at(30)),
		agentLaunch("agent-one", at(29)),
		workflowLaunch("workflow-one", at(28)),
		assistant(50_000, { minutesAgo: 27 }),
		taskStop("bash-one", at(20)),
		taskStop("agent-one", at(19), "local_agent"),
		assistant(51_000, { minutesAgo: 18 }),
	);

	assert.deepEqual(pending(entries), [
		{ id: "workflow-one", kind: "workflow" },
	]);
});

test("a task named by more than one record is pending once, where it was launched", () => {
	const entries = context(
		agentLaunch("agent-one", at(30)),
		agentLaunch("agent-two", at(29)),
		assistant(50_000, { minutesAgo: 28 }),
		agentResume("agent-one", at(20)),
		agentResume("agent-one", at(15)),
		assistant(51_000, { minutesAgo: 14 }),
	);

	assert.deepEqual(pending(entries), [
		{ id: "agent-one", kind: "agent" },
		{ id: "agent-two", kind: "agent" },
	]);
});

test("a notification ends the launch it names and no other", () => {
	const entries = context(
		agentLaunch("first", at(10)),
		workflowLaunch("second", at(9)),
		assistant(50_000, { minutesAgo: 8 }),
		notified("first", at(5)),
		assistant(51_000, { minutesAgo: 4 }),
	);

	assert.deepEqual(pending(entries), [{ id: "second", kind: "workflow" }]);
});

// The call itself names no id, so a launch read from it could never be ended
// by a notification, and would read as pending for the rest of the session.
test("a call with run_in_background and no result is not a launch", () => {
	const entries = context(
		assistant(50_000, {
			minutesAgo: 5,
			calls: [
				{
					name: "Bash",
					input: { command: "sleep 600", run_in_background: true },
				},
			],
		}),
	);

	assert.deepEqual(pending(entries), []);
});

// A launch is the record Claude Code wrote for one, not any text that quotes
// one: a transcript read into a tool result would otherwise arm a wake for
// work that is not this session's, which no notification can ever end.
test("a tool result that quotes another session's launch is not one", () => {
	const entries = context(
		toolResult(
			'{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_01","content":"Command did not complete within its 120s timeout and was moved to the background (ID: bj3tmeqhs). Output is being written to: /tmp/tasks/bj3tmeqhs.output."}]}}',
			at(5),
		),
		toolResult(
			"Async agent launched successfully.\nagentId: quoted1 (internal ID)",
			at(4),
		),
		assistant(50_000, { minutesAgo: 3 }),
	);

	assert.deepEqual(pending(entries), []);
});

test("a record that names an agent under any other status is not a launch", () => {
	const line = toolResult("The agent's report", at(5), {
		toolUseResult: { status: "completed", agentId: "sync-agent" },
	});

	assert.deepEqual(pending(context(line)), []);
});

test("a task notification names its id and nothing else does", () => {
	assert.equal(taskNotification(entry(notified("done-1", at(1)))), "done-1");
	assert.equal(
		taskNotification(entry(notified("done-2", at(1), "queued"))),
		"done-2",
	);
	assert.equal(
		taskNotification(entry(notified("done-3", at(1), "attached"))),
		"done-3",
	);
	assert.equal(taskNotification(entry(taskStop("stopped", at(1)))), null);
	assert.equal(taskNotification(entry(prompt("A prompt", at(1)))), null);
	assert.equal(taskNotification(entry(assistant(1000))), null);
	assert.equal(taskNotification(entry(agentLaunch("launched", at(1)))), null);
});
