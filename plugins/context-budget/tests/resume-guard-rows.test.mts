// Which limits a resume is measured against: the first row whose key matches
// the resumed agent's type, then the first whose key matches the model its
// newest turn names, then the section's own numbers. One resume can be worth
// taking at 600K and another worth refusing at 150K, and reading the wrong row
// is the failure nobody notices, since the deny it writes is well-formed and
// the number in it is real.
//
// The rows below sit on either side of the section's numbers, so which one
// governed a resume is legible in whether it was denied. What makes a resume
// worth refusing at all is `resume-guard.test.mts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { runtimes } from "../../../tests/harness.mts";
import { assistant } from "./fixtures.mts";
import { decided, denied, guardRunner, PROMPT } from "./guard-runs.mts";
import {
	configFile,
	DEFAULTS,
	GUARD_MESSAGES,
	MESSAGES,
	sessionId,
	subagentSession,
} from "./harness.mts";

/** Model ids as a transcript records them, which is what a row key matches. */
const OPUS = "claude-opus-5";
const FABLE = "claude-fable-5-1";
const HAIKU = "claude-haiku-4-5-20251001";

const SECTION = "[resume-guard]\nlarge = 300_000\ncold = 200_000\n";

const FIXER_ROW =
	"[resume-guard.agents.'red-green-fixer']\nlarge = 100_000\ncold = 60_000\n";

/** Rows under both keys, tighter and wider than the section, and two off. */
const ROWS = configFile(
	DEFAULTS,
	MESSAGES,
	SECTION,
	FIXER_ROW,
	"[resume-guard.agents.'hushed']\nenabled = false\n",
	"[resume-guard.models.'fable']\nlarge = 600_000\ncold = 400_000\n",
	"[resume-guard.models.'haiku']\nenabled = false\n",
	GUARD_MESSAGES,
);

/**
 * The same section under one model row that matches every id there is. A
 * transcript that names a model is allowed by that row, so a deny is proof
 * that the model rows were skipped whole.
 */
const CATCH_ALL = configFile(
	DEFAULTS,
	MESSAGES,
	SECTION,
	"[resume-guard.models.'.*']\nenabled = false\n",
	GUARD_MESSAGES,
);

for (const runtime of runtimes()) {
	const guard = guardRunner(runtime);
	const sid = () => sessionId(runtime);
	const name = (what: string) => `${runtime}: ${what}`;
	const run = (transcript: string, to: string, config = ROWS) =>
		guard(sid(), transcript, to, config);

	// Nothing in either table matches an implementer on Opus, so the resume
	// is measured against the section's own numbers.
	test(name("the section's numbers govern a resume no row matches"), () => {
		denied(
			run(
				subagentSession(
					"planner",
					[assistant(350_000, { model: OPUS })],
					[PROMPT],
					"den:implementer",
				),
				"planner",
			),
		);
	});

	// 250K is under every `large` in the file, so the expired cache is the only
	// thing that puts this resume past a limit, and the limit is the section's.
	test(name("a cold resume is measured against the section's cold"), () => {
		denied(
			run(
				subagentSession(
					"chilly",
					[assistant(250_000, { model: OPUS, minutesAgo: 10, ttl: "5m" })],
					[PROMPT],
				),
				"chilly",
			),
		);
	});

	// The same resume on Fable, whose row puts `cold` at 400K: a cold cache
	// under the row's own number is nothing to refuse a resume over.
	test(name("a model row's cold governs a cold resume"), () => {
		assert.equal(
			decided(
				run(
					subagentSession(
						"cool",
						[assistant(250_000, { model: FABLE, minutesAgo: 10, ttl: "5m" })],
						[PROMPT],
					),
					"cool",
				),
			),
			null,
		);
	});

	// A resume the section's own numbers would refuse, allowed by the model row
	// above them, with and without an agent type recorded: neither "subagent"
	// nor an implementer matches a row in the agent table, so both go on to the
	// model rows.
	test(name("a model row governs a resume no agent row matches"), () => {
		const turns = [assistant(500_000, { model: FABLE })];

		assert.equal(
			decided(run(subagentSession("wide", turns, [PROMPT]), "wide")),
			null,
			"500K is past the section's 300K and under the fable row's 600K",
		);
		assert.equal(
			decided(
				run(
					subagentSession("wide", turns, [PROMPT], "den:implementer"),
					"wide",
				),
			),
			null,
			"an agent type matching no row falls through to the same model row",
		);
	});

	// The agent type is the more specific fact about a resume, so its table is
	// read first. This one matches the fable row as well, and that row would
	// allow it. The key is matched with the plugin prefix in place.
	test(name("an agent row wins over the model row that also matches"), () => {
		denied(
			run(
				subagentSession(
					"fixer",
					[assistant(150_000, { model: FABLE })],
					[PROMPT],
					"den:red-green-fixer",
				),
				"fixer",
			),
		);
	});

	// A row switched off is the answer for what it matches, not a reason to
	// look on, and it needs no numbers to be one: this resume is past every
	// number in the file, and past the cache lifetime its last turn wrote under.
	test(name("a model row switched off allows a resume of any size"), () => {
		assert.equal(
			decided(
				run(
					subagentSession(
						"cheap",
						[assistant(800_000, { model: HAIKU, minutesAgo: 90, ttl: "5m" })],
						[PROMPT],
					),
					"cheap",
				),
			),
			null,
		);
	});

	// The same, one table earlier: the fable row carries numbers this resume is
	// far past, and never governs it.
	test(
		name("an agent row switched off wins over a model row with numbers"),
		() => {
			assert.equal(
				decided(
					run(
						subagentSession(
							"hushed",
							[assistant(800_000, { model: FABLE })],
							[PROMPT],
							"den:hushed",
						),
						"hushed",
					),
				),
				null,
			);
		},
	);

	// The model rows are skipped whole for a transcript that records no model,
	// catch-all key and all, and the section's numbers decide. Why the skip is
	// there is on `rowFor` in `keyed-rows.mts`.
	test(name("a transcript naming no model reaches no model row"), () => {
		assert.equal(
			decided(
				run(
					subagentSession(
						"named",
						[assistant(350_000, { model: OPUS })],
						[PROMPT],
					),
					"named",
					CATCH_ALL,
				),
			),
			null,
			"the catch-all row switches the guard off for every id it does see",
		);
		denied(
			run(
				subagentSession(
					"nameless",
					[assistant(350_000, { model: "" })],
					[PROMPT],
				),
				"nameless",
				CATCH_ALL,
			),
		);
	});

	// `enabled = false` on the section switches the guard off whole, rows
	// included. A switch named for switching off that left its own rows
	// governing is one a user cannot reach for, and a file that wants the rows
	// and nothing else has a plain route: a fallback high enough to catch
	// nothing.
	test(name("a section switched off takes its rows with it"), () => {
		const config = configFile(
			DEFAULTS,
			MESSAGES,
			"[resume-guard]\nenabled = false\n",
			FIXER_ROW,
			GUARD_MESSAGES,
		);

		assert.equal(
			decided(
				run(
					subagentSession(
						"fixer",
						[assistant(150_000, { model: OPUS })],
						[PROMPT],
						"den:red-green-fixer",
					),
					"fixer",
					config,
				),
			),
			null,
			"the row would refuse this resume, and never governs it",
		);
		assert.equal(
			decided(
				run(
					subagentSession(
						"unfixed",
						[assistant(800_000, { model: OPUS })],
						[PROMPT],
						"den:implementer",
					),
					"unfixed",
					config,
				),
			),
			null,
			"an agent type no row matches reaches the section, which is off",
		);
	});
}
