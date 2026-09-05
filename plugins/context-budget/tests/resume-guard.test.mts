// What the resume guard decides, exercised through the launcher -- the exact
// command `hooks.json` runs. Real transcript files, real config files, a real
// session record: the wiring between the three is where the guard lives, and
// the deny wording every case asserts on is the wording that case wrote.
import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import {
	type Result,
	type Runtime,
	runtimes,
} from "../../../tests/harness.mts";
import {
	assistantTurn,
	configFile,
	DEFAULTS,
	GUARD,
	GUARD_MESSAGES,
	hookRunner,
	lostSession,
	MESSAGES,
	noTranscript,
	quiet,
	reported,
	sessionId,
	subagentSession,
	transcript,
} from "./harness.mts";

interface Decision {
	readonly hookSpecificOutput?: {
		readonly permissionDecision?: string;
		readonly permissionDecisionReason?: string;
	};
}

const PROMPT = JSON.stringify({
	type: "user",
	message: { role: "user", content: "carry on" },
});

const CONFIG = configFile(DEFAULTS, MESSAGES, GUARD, GUARD_MESSAGES);

/** A config fault is what a run that has reported nothing yet still reports. */
const BROKEN = configFile("[resume-guard\nlarge = 10\n");

// The user's answer to an AskUserQuestion, as it lands in the transcript: one
// answer approves one resume, and the guard remembers the entry's uuid.
const answer = (uuid: string) =>
	JSON.stringify({
		type: "user",
		uuid,
		message: {
			role: "user",
			content: [
				{
					type: "tool_result",
					content: 'Your questions have been answered: "Resume big?"="Resume"',
				},
			],
		},
	});

/** An answer id nothing else has used. */
const answerId = (runtime: Runtime): string =>
	`resume-guard-test-${process.pid}-${runtime}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function decided(result: Result): Decision["hookSpecificOutput"] | null {
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stderr, "");

	return result.stdout === ""
		? null
		: (JSON.parse(result.stdout) as Decision).hookSpecificOutput;
}

function reason(result: Result): string {
	const output = decided(result);

	assert.equal(
		output?.permissionDecision,
		"deny",
		"the call should have been denied",
	);

	return String(output?.permissionDecisionReason);
}

for (const runtime of runtimes()) {
	const hook = hookRunner(runtime);
	const sid = () => sessionId(runtime);
	const name = (what: string) => `${runtime}: ${what}`;
	const run = (
		session: string,
		transcript: string,
		to: string,
		config = CONFIG,
	) =>
		hook(
			"resume-guard",
			{
				hook_event_name: "PreToolUse",
				tool_name: "SendMessage",
				session_id: session,
				tool_input: { to },
				transcript_path: transcript,
			},
			config,
		);

	// A guard switched off allows every resume, and waives the limits it would
	// otherwise need written for it.
	test(
		name("a resume above `large` is denied, and `enabled = false` allows it"),
		() => {
			const transcript = subagentSession("big", 162_300, 0, [PROMPT]);

			assert.match(
				reason(run(sid(), transcript, "big")),
				/^DENIED big: context 162\.3K tokens is above the 150K resume limit/,
			);
			assert.equal(
				decided(
					run(
						sid(),
						transcript,
						"big",
						configFile(
							DEFAULTS,
							MESSAGES,
							"[resume-guard]\nenabled = false\n",
							GUARD_MESSAGES,
						),
					),
				),
				null,
				"a disabled guard must allow the same call",
			);
		},
	);

	// Claude Code names the path this hook reads, and a path it has named is
	// not always a file: with no session transcript there is no subagent
	// transcript beside it either, so there is nothing to guard rather than a
	// run to fail. Nothing is reported for it either, which the config fault
	// after it is the proof of -- a session already told something would hear
	// nothing more.
	test(name("a transcript that is not there guards nothing"), () => {
		const session = sid();

		quiet(run(session, noTranscript(), "big"));
		reported(
			run(session, subagentSession("big", 162_300, 0, [PROMPT]), "big", BROKEN),
			"config",
		);
	});

	// The guard reads two transcripts: the subagent's, for what the resume
	// would cost, and the session's own, for the answer the user may have
	// given. A session transcript that is not there is an answer nobody can
	// find rather than a run to stop, and an unfindable answer is no answer.
	test(name("a session transcript that is not there still decides"), () => {
		assert.match(
			reason(run(sid(), lostSession("big", 162_300), "big")),
			/^DENIED big: context 162\.3K tokens is above the 150K resume limit/,
		);
	});

	// Under both limits with a warm cache: nothing about this resume is
	// expensive, so the guard has to stay out of the way.
	test(name("a warm subagent under both limits is left alone"), () => {
		assert.equal(
			decided(
				run(sid(), subagentSession("medium", 100_000, 0, [PROMPT]), "medium"),
			),
			null,
		);
	});

	// 60K is under `large`, so the expired 5m cache is the only thing that puts
	// this resume past a limit at all.
	test(name("an expired cache denies a resume above `cold`"), () => {
		assert.match(
			reason(
				run(sid(), subagentSession("napping", 60_000, 10, [PROMPT]), "napping"),
			),
			/last active 10 min ago, 5m cache expired: cold full-price replay of 60K tokens/,
		);
	});

	// The user approves each resume, not just the first: the guard reads the
	// answer out of the transcript itself, and spends it once.
	test(
		name("one Resume answer approves one resume, and the next is denied"),
		() => {
			const uuid = answerId(runtime);
			const transcript = subagentSession("big", 162_300, 0, [
				PROMPT,
				answer(uuid),
			]);
			const session = sid();

			assert.equal(
				decided(run(session, transcript, "big")),
				null,
				"the user's answer approves one resume",
			);
			assert.match(
				reason(run(session, transcript, "big")),
				/^USED big: context 162\.3K tokens is above the 150K resume limit/,
			);

			// With that answer spent, a transcript carrying none reaches `denied`.
			assert.match(
				reason(
					run(session, subagentSession("big", 162_300, 0, [PROMPT]), "big"),
				),
				/^DENIED big:/,
			);
		},
	);

	// Both hooks keep one record per session, so what one of them writes must
	// not undo what the other did. The fall back to nothing is the sharp case:
	// that is where a session which has been told nothing and spent nothing
	// has its record dropped.
	test(
		name("a measurement between two resumes leaves the answer spent"),
		() => {
			const uuid = answerId(runtime);
			const approved = subagentSession("big", 162_300, 0, [
				PROMPT,
				answer(uuid),
			]);
			const session = sid();
			const measure = (tokens: number) =>
				hook(
					"context-budget",
					{
						hook_event_name: "UserPromptSubmit",
						session_id: session,
						transcript_path: transcript(assistantTurn(tokens)),
					},
					CONFIG,
				);

			assert.equal(decided(run(session, approved, "big")), null);
			assert.ok(measure(200_000).stdout.includes("NOTICE"));
			assert.equal(measure(100_000).stdout, "", "a fall injects nothing");
			assert.match(reason(run(session, approved, "big")), /^USED big:/);
		},
	);
}
