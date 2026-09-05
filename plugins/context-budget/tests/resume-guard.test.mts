// What makes a resume worth refusing, exercised through the launcher, on the
// exact command `hooks.json` runs. Real transcript files, real config files:
// the wiring between them is where the guard lives, and the deny wording every
// case asserts on is the wording that case wrote.
//
// The user's answer to a refusal, and how it is spent, is
// `resume-approval.test.mts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { type Result, runtimes } from "../../../tests/harness.mts";
import { apiError, assistant } from "./fixtures.mts";
import {
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
			const transcript = subagentSession("big", [assistant(162_300)], [PROMPT]);

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
	// after it proves: a session already told something would hear nothing
	// more.
	test(name("a transcript that is not there guards nothing"), () => {
		const session = sid();

		quiet(run(session, noTranscript(), "big"));
		reported(
			run(
				session,
				subagentSession("big", [assistant(162_300)], [PROMPT]),
				"big",
				BROKEN,
			),
			"config",
		);
	});

	// The guard reads two transcripts: the subagent's, for what the resume
	// would cost, and the session's own, for the answer the user may have
	// given. A session transcript that is not there is an answer nobody can
	// find rather than a run to stop, and an unfindable answer is no answer.
	test(name("a session transcript that is not there still decides"), () => {
		assert.match(
			reason(run(sid(), lostSession("big", [assistant(162_300)]), "big")),
			/^DENIED big: context 162\.3K tokens is above the 150K resume limit/,
		);
	});

	test(name("a warm subagent under both limits is left alone"), () => {
		assert.equal(
			decided(
				run(
					sid(),
					subagentSession("medium", [assistant(100_000)], [PROMPT]),
					"medium",
				),
			),
			null,
		);
	});

	// 60K is under `large`, so the expired 5m cache is the only thing that puts
	// this resume past a limit at all.
	test(name("an expired cache denies a resume above `cold`"), () => {
		assert.match(
			reason(
				run(
					sid(),
					subagentSession(
						"napping",
						[assistant(60_000, { minutesAgo: 10, ttl: "5m" })],
						[PROMPT],
					),
					"napping",
				),
			),
			/last active 10 min ago, 5m cache expired: cold full-price replay of 60K tokens/,
		);
	});

	// A request served entirely from a warm cache writes nothing back to it, so
	// both its cache-creation splits are zero and it says nothing about the
	// lifetime in force. Reading that silence as 5m makes every subagent whose
	// last turn was a cache hit look cold minutes after it stopped, and refuses
	// a resume whose cache in fact has most of an hour left.
	test(
		name("a turn that wrote nothing takes its lifetime from one that did"),
		() => {
			assert.equal(
				decided(
					run(
						sid(),
						subagentSession(
							"dozing",
							[
								assistant(60_000, { minutesAgo: 90, ttl: "1h" }),
								assistant(60_000, { minutesAgo: 20, ttl: null }),
							],
							[PROMPT],
						),
						"dozing",
					),
				),
				null,
				"20 minutes into the 1h lifetime that turn wrote under, and 60K is under `large`",
			);
		},
	);

	// The lifetime comes from the writing turn; how long ago the subagent
	// stopped does not. Its cache was refreshed by every turn since, so the one
	// that says when it last ran is the newest.
	test(
		name("the cache age is measured from the last turn, not the writing one"),
		() => {
			assert.match(
				reason(
					run(
						sid(),
						subagentSession(
							"dozed-off",
							[
								assistant(60_000, { minutesAgo: 200, ttl: "1h" }),
								assistant(60_000, { minutesAgo: 70, ttl: null }),
							],
							[PROMPT],
						),
						"dozed-off",
					),
				),
				/last active 70 min ago, 1h cache expired: cold full-price replay of 60K tokens/,
			);
		},
	);

	// A subagent whose newest entry is a failed request has a usage with every
	// field zero, which measures its context at nothing and lets any resume
	// through, including the one this guard exists for, where every turn from
	// here on re-reads 162.3K tokens.
	test(name("a request that failed is not the subagent's last turn"), () => {
		assert.match(
			reason(
				run(
					sid(),
					subagentSession(
						"stalled",
						[
							assistant(162_300, { minutesAgo: 3, ttl: "1h" }),
							apiError({ minutesAgo: 1 }),
						],
						[PROMPT],
					),
					"stalled",
				),
			),
			/context 162\.3K tokens is above the 150K resume limit/,
		);
	});
}
