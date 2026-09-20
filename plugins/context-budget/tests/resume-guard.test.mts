// What makes a resume worth refusing: how big the subagent's context is and
// how cold its prompt cache has gone. Exercised through the launcher, on the
// exact command `hooks.json` runs. Real transcript files, real config files:
// the wiring between them is where the guard lives. A deny is checked as a
// deny, and what its reason says is not read.
//
// Which limits a resume is measured against is `resume-guard-rows.test.mts`,
// which agent a message reaches is `resume-guard-target.test.mts`, and the
// user's answer to a refusal, with how it is spent, is
// `resume-approval.test.mts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { runtimes } from "../../../tests/harness.mts";
import { agentLaunch, taskNotification } from "./background-fixtures.mts";
import {
	apiError,
	assistant,
	at,
	COMPACT_SUMMARY,
	compactBoundary,
} from "./fixtures.mts";
import { decided, denied, guardRunner, PROMPT } from "./guard-runs.mts";
import {
	BROKEN,
	configFile,
	DEFAULTS,
	GUARD_MESSAGES,
	lostSession,
	MESSAGES,
	noTranscript,
	quiet,
	reported,
	sessionId,
	subagentSession,
	USABLE,
} from "./harness.mts";

const CONFIG = configFile(USABLE);

for (const runtime of runtimes()) {
	const guard = guardRunner(runtime);
	const sid = () => sessionId(runtime);
	const name = (what: string) => `${runtime}: ${what}`;
	const run = (
		session: string,
		transcript: string,
		to: string,
		config = CONFIG,
	) => guard(session, transcript, to, config);

	// A guard switched off allows every resume, and waives the limits it would
	// otherwise need written for it.
	test(
		name("a resume above `large` is denied, and `enabled = false` allows it"),
		() => {
			const transcript = subagentSession("big", [assistant(162_300)], [PROMPT]);

			denied(run(sid(), transcript, "big"));
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
				configFile(BROKEN),
			),
		);
	});

	// The guard reads two transcripts: the subagent's, for what the resume
	// would cost, and the session's own, for the answer the user may have
	// given. A session transcript that is not there is an answer nobody can
	// find rather than a run to stop, and an unfindable answer is no answer.
	test(name("a session transcript that is not there still decides"), () => {
		denied(run(sid(), lostSession("big", [assistant(162_300)]), "big"));
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
		denied(
			run(
				sid(),
				subagentSession(
					"napping",
					[assistant(60_000, { minutesAgo: 10, ttl: "5m" })],
					[PROMPT],
				),
				"napping",
			),
		);
	});

	// A request served entirely from a warm cache writes nothing back to it, so
	// both its cache-creation splits are zero and it says nothing about the
	// lifetime in force. Reading that silence as 5m makes every subagent whose
	// last turn was a cache hit look cold minutes after it stopped, and refuses
	// a resume whose cache in fact has most of an hour left. The age itself is
	// measured from the newest turn, since every turn since the writing one
	// refreshed the cache.
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

	// `hurried` is past both limits: 162.3K against `large`, and ten minutes
	// into a 5m cache against `cold`. The second session puts its launch above a
	// compaction, which ends no agent, and the refusal at the end adds the
	// notification that makes the next message a resume.
	test(name("a message to an agent still running is left alone"), () => {
		const turns = [assistant(162_300, { minutesAgo: 10, ttl: "5m" })];
		const launched = [PROMPT, agentLaunch("hurried", at(30))];

		for (const session of [
			launched,
			[...launched, compactBoundary(), COMPACT_SUMMARY, PROMPT],
		]) {
			assert.equal(
				decided(
					run(sid(), subagentSession("hurried", turns, session), "hurried"),
				),
				null,
			);
		}

		denied(
			run(
				sid(),
				subagentSession("hurried", turns, [
					...launched,
					taskNotification("hurried", at(9)),
				]),
				"hurried",
			),
		);
	});

	// A subagent whose newest entry is a failed request has a usage with every
	// field zero, which measures its context at nothing and lets any resume
	// through, including the one this guard exists for, where every turn from
	// here on re-reads 162.3K tokens.
	test(name("a request that failed is not the subagent's last turn"), () => {
		denied(
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
		);
	});
}
