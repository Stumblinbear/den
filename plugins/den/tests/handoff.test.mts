// The handoff: the prompt hook that records where the transcript is, and the
// reading the skill's preamble runs off it. Both run through the launcher,
// the exact command `hooks.json` and the skill run, against transcripts
// written line by line the way Claude Code writes them.
//
// What is asserted is which situations produce a reading and which stay
// silent; its wording is read by a session, not by a test. The one wording
// the tests do hold is the header and the labels the reading's rows carry,
// which the skill text has to match verbatim.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	dataDir,
	fixtureDir,
	type Result,
	runHook,
	runtimes,
} from "../../../tests/harness.mts";
import { BRIEF, FORK, HANDOFF_HEADER } from "../lib/handoff.mts";

const PLUGIN = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const LAUNCHER = join(PLUGIN, "lib", "shared", "launch.mjs");

// Spelled out rather than imported, so a record that moves fails a test
// instead of taking the tests with it.
const RECORD_DIR = "claude-den-session";

const turn = (tokens: number, extra: Record<string, unknown> = {}) => ({
	type: "assistant",
	message: {
		model: "claude-fable-5-1",
		usage: { input_tokens: 32, cache_read_input_tokens: tokens - 32 },
	},
	...extra,
});

const typed = (text: string, extra: Record<string, unknown> = {}) => ({
	type: "user",
	message: { role: "user", content: text },
	...extra,
});

/** A tool result Claude Code wrote under the user role: not something typed. */
const toolResult = () => ({
	type: "user",
	message: {
		role: "user",
		content: [{ type: "tool_result", content: "ok", tool_use_id: "t" }],
	},
	toolUseResult: "ok",
});

const compaction = () => ({ type: "system", subtype: "compact_boundary" });

function transcript(dir: string, entries: readonly unknown[]): string {
	const path = join(dir, "session.jsonl");

	writeFileSync(path, `${entries.map((e) => JSON.stringify(e)).join("\n")}\n`);

	return path;
}

function ok(result: Result): string {
	assert.equal(result.status, 0, result.stderr);

	return result.stdout;
}

test("the skill text carries the header and the labels the reading uses", () => {
	const skill = readFileSync(
		join(PLUGIN, "skills", "handoff-cost", "SKILL.md"),
		"utf8",
	);
	const lead = readFileSync(join(PLUGIN, "skills", "lead", "SKILL.md"), "utf8");

	for (const literal of [HANDOFF_HEADER, FORK, BRIEF]) {
		assert.ok(skill.includes(`\`${literal}\``), literal);
	}

	// The lead names the question, and the skill owns the labels under it.
	assert.ok(lead.includes(HANDOFF_HEADER), HANDOFF_HEADER);
});

for (const runtime of runtimes()) {
	const data = dataDir(runtime);
	const name = (what: string) => `${runtime}: ${what}`;
	const run = (temp: string, argv: readonly string[], input: unknown) =>
		runHook({ launcher: LAUNCHER, data, temp, argv, input });

	const record = (temp: string, session: string, path: string) =>
		run(temp, ["hooks/transcript-record"], {
			hook_event_name: "UserPromptSubmit",
			session_id: session,
			transcript_path: path,
			prompt: "carry on",
		});

	const reading = (temp: string, session: string) =>
		ok(run(temp, ["scripts/handoff-cost", "--session", session], {}));

	test(
		name("a prompt records the transcript, and a subagent's does not"),
		() => {
			const temp = fixtureDir("record");
			const path = transcript(temp, [turn(1000)]);

			assert.equal(ok(record(temp, "main", path)), "");
			assert.deepEqual(
				JSON.parse(readFileSync(join(temp, RECORD_DIR, "main.json"), "utf8")),
				{ transcript_path: path },
			);

			ok(
				run(temp, ["hooks/transcript-record"], {
					hook_event_name: "UserPromptSubmit",
					session_id: "sub",
					agent_id: "agent-1",
					transcript_path: path,
				}),
			);
			assert.throws(() => readFileSync(join(temp, RECORD_DIR, "sub.json")));
		},
	);

	test(name("the reading prices the newest main-session turn"), () => {
		const temp = fixtureDir("reading");
		const path = transcript(temp, [
			turn(90_000),
			typed("go on"),
			turn(110_532),
			toolResult(),
			// A subagent's turn sharing the transcript is not the session's.
			turn(5_000, { isSidechain: true }),
		]);

		ok(record(temp, "s", path));

		const text = reading(temp, "s");

		assert.ok(text.includes("110,532 tokens on claude-fable-5-1"), text);
		assert.ok(text.includes(`${FORK} (stays on claude-fable-5-1)`), text);
		assert.ok(!text.includes("$"), text);
	});

	test(
		name("the reading is unpriced after a compaction or with no record"),
		() => {
			const temp = fixtureDir("unpriced");
			const path = transcript(temp, [turn(110_532), compaction()]);

			ok(record(temp, "s", path));

			const compacted = reading(temp, "s");

			assert.ok(compacted.includes("Context size unknown"), compacted);
			assert.ok(!compacted.includes("110,532"), compacted);
			assert.ok(compacted.includes(FORK), compacted);

			const unrecorded = reading(temp, "never-prompted");

			assert.ok(unrecorded.includes("Context size unknown"), unrecorded);
			assert.ok(unrecorded.includes("no transcript is recorded"), unrecorded);
		},
	);
}
