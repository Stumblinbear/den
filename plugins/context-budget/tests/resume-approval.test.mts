// The user's consent to a resume, and how the guard spends it. The answer is
// read out of the session transcript itself rather than taken from anything
// the agent says about it, and one answer buys one resume: the second attempt
// on the same answer is refused with the `used` message.
//
// What makes a resume worth refusing in the first place is
// `resume-guard.test.mts`.
import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { type Runtime, runtimes } from "../../../tests/harness.mts";
import { assistant } from "./fixtures.mts";
import { decided, guardRunner, PROMPT, reason } from "./guard-runs.mts";
import {
	configFile,
	hookRunner,
	sessionId,
	subagentSession,
	transcript,
	USABLE,
} from "./harness.mts";

const CONFIG = configFile(USABLE);

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
	`resume-approval-test-${process.pid}-${runtime}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

for (const runtime of runtimes()) {
	const hook = hookRunner(runtime);
	const guard = guardRunner(runtime);
	const name = (what: string) => `${runtime}: ${what}`;
	const run = (session: string, path: string) =>
		guard(session, path, "big", CONFIG);

	// The user approves each resume, not just the first: the guard reads the
	// answer out of the transcript itself, and spends it once.
	test(
		name("one Resume answer approves one resume, and the next is denied"),
		() => {
			const uuid = answerId(runtime);
			const approved = subagentSession(
				"big",
				[assistant(162_300)],
				[PROMPT, answer(uuid)],
			);
			const session = sessionId(runtime);

			assert.equal(
				decided(run(session, approved)),
				null,
				"the user's answer approves one resume",
			);
			assert.match(
				reason(run(session, approved)),
				/^USED big: context 162\.3K tokens is above the 150K resume limit/,
			);

			// With that answer spent, a transcript carrying none reaches `denied`.
			assert.match(
				reason(
					run(session, subagentSession("big", [assistant(162_300)], [PROMPT])),
				),
				/^DENIED big:/,
			);
		},
	);

	// Both hooks keep one record per session, so what one of them writes must
	// not undo what the other did. The fall back to nothing is the sharp case:
	// that is where a session which has been told nothing and spent nothing
	// would have had its record dropped.
	test(
		name("a measurement between two resumes leaves the answer spent"),
		() => {
			const uuid = answerId(runtime);
			const approved = subagentSession(
				"big",
				[assistant(162_300)],
				[PROMPT, answer(uuid)],
			);
			const session = sessionId(runtime);
			const measure = (tokens: number) =>
				hook(
					"context-budget",
					{
						hook_event_name: "UserPromptSubmit",
						session_id: session,
						transcript_path: transcript(assistant(tokens)),
					},
					CONFIG,
				);

			assert.equal(decided(run(session, approved)), null);
			assert.ok(measure(200_000).stdout.includes("NOTICE"));
			assert.equal(measure(100_000).stdout, "", "a fall injects nothing");
			assert.match(reason(run(session, approved)), /^USED big:/);
		},
	);
}
