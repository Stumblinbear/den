import assert from "node:assert/strict";
import { test } from "node:test";
import {
	type Agent,
	noSuitableProposal,
	proposal,
	runWorkflow,
} from "./workflow-harness.mts";

const DIRECTION = "/work/loader/docs/project-direction.md";

const DECISIONS = [
	"The loader owns the host registry, since a second owner would repeat its guard.",
	"Existing configurations keep working, the user having said so.",
];

const EXPLORE = { ask: "Add a host", direction: DIRECTION, explorer: "opus" };

/**
 * The proposals a judge launch carries: the JSON array the prompt ends on,
 * which is data handed on rather than prose.
 */
const designsIn = (
	prompt: string,
): readonly { readonly design: Record<string, unknown> }[] =>
	JSON.parse(prompt.slice(prompt.lastIndexOf("\n[") + 1));

test("design context and uncertainty survive the explorer-to-judge handoff", async () => {
	const questions = ["Must existing configurations survive a host migration?"];
	const assumptions = ["The third host is only a possibility."];
	let explorers = 0;
	let judges = 0;
	const verdict = {
		...noSuitableProposal(),
		outcome: "needs-input",
		differences: "Compatibility intent is not yet settled.",
	};
	const result = await runWorkflow(
		"design-exploration-workflow",
		{ ...EXPLORE, decisions: DECISIONS },
		async (prompt, options) => {
			if (options.agentType === "den:design-explorer") {
				explorers += 1;
				assert.ok(options.schema?.required.includes("questions"));
				assert.ok(options.schema?.required.includes("assumptions"));
				return { ...proposal(), status: "needs-input", questions, assumptions };
			}
			judges += 1;
			assert.equal(explorers, 3);
			for (const { design } of designsIn(prompt)) {
				assert.deepEqual(design["questions"], questions);
				assert.deepEqual(design["assumptions"], assumptions);
			}
			assert.ok(options.schema?.required.includes("outcome"));
			return verdict;
		},
	);
	assert.equal(judges, 1);
	assert.deepEqual((result as { ranking: unknown }).ranking, verdict);
});

test("the direction record and the decision list are checked before dispatch", async () => {
	const rejected: readonly Record<string, unknown>[] = [
		{ direction: undefined },
		{ direction: 7 },
		{ direction: " " },
		// A relative path resolves against the tree the run was launched from.
		{ direction: "docs/project-direction.md" },
		{ decisions: "The loader owns the host registry" },
		{ decisions: [7] },
		{ decisions: [" "] },
		{ decisions: ["x".repeat(401)] },
		{ basis: "Two hosts, independently maintained" },
		{ explorer: undefined },
		{ explorer: "haiku" },
	];

	for (const override of rejected) {
		let launched = 0;

		await assert.rejects(
			runWorkflow(
				"design-exploration-workflow",
				{ ...EXPLORE, ...override },
				async () => {
					launched += 1;
					return null;
				},
			),
		);
		assert.equal(launched, 0, "invalid context must not launch an agent");
	}
});

test("the explorers run on the model the launch names and the judge on its own", async () => {
	for (const explorer of ["fable", "opus"]) {
		const models: (string | undefined)[] = [];
		let judged: string | undefined = "unset";
		await runWorkflow(
			"design-exploration-workflow",
			{ ...EXPLORE, explorer },
			async (_prompt, options) => {
				if (options.agentType === "den:design-explorer") {
					models.push(options.model);
					return proposal();
				}
				judged = options.model;
				return noSuitableProposal();
			},
		);
		assert.deepEqual(models, [explorer, explorer, explorer]);
		assert.equal(judged, undefined);
	}
});

test("a missing design result cannot become a smaller successful comparison", async () => {
	let index = 0;
	let judged = 0;
	await assert.rejects(
		runWorkflow(
			"design-exploration-workflow",
			EXPLORE,
			async (_prompt, options) => {
				if (options.agentType !== "den:design-explorer") {
					judged += 1;
					return noSuitableProposal();
				}
				return index++ === 1 ? null : proposal();
			},
		),
	);
	assert.equal(judged, 0, "the judge ran on the proposals left");
});

test("a judge cannot recommend an absent or unresolved proposal", async () => {
	for (const recommendation of [3, 0]) {
		await assert.rejects(
			runWorkflow(
				"design-exploration-workflow",
				EXPLORE,
				async (_prompt, options) =>
					options.agentType === "den:design-explorer"
						? {
								...proposal(),
								status: "needs-input",
								questions: ["Who owns updates?"],
							}
						: {
								...noSuitableProposal(),
								outcome: "recommendation",
								recommendation,
								ranking: [
									{
										index: recommendation,
										rank: 1,
										strengths: "Fits",
										costs: "One seam",
									},
								],
							},
			),
		);
	}
});

test("a selectable design and unresolved outcomes retain distinct results", async () => {
	for (const outcome of [
		"recommendation",
		"needs-input",
		"no-suitable-proposal",
	]) {
		const verdict = {
			...noSuitableProposal(),
			outcome,
			recommendation: outcome === "recommendation" ? 1 : null,
			ranking:
				outcome === "recommendation"
					? [{ index: 1, rank: 1, strengths: "Fits", costs: "One seam" }]
					: [],
		};
		const result = await runWorkflow(
			"design-exploration-workflow",
			EXPLORE,
			async (_prompt, options) =>
				options.agentType === "den:design-explorer" ? proposal() : verdict,
		);
		assert.deepEqual((result as { ranking: unknown }).ranking, verdict);
	}
});

test("an unresolved judge outcome cannot select a design", async () => {
	for (const outcome of ["needs-input", "no-suitable-proposal"]) {
		await assert.rejects(
			runWorkflow(
				"design-exploration-workflow",
				EXPLORE,
				async (_prompt, options) =>
					options.agentType === "den:design-explorer"
						? proposal()
						: { ...noSuitableProposal(), outcome, recommendation: 0 },
			),
		);
	}
});

const GOAL = "An empty path fails where the caller can see it.";

const REPO = "/work/loader";

const ARGS = {
	repo: REPO,
	goal: GOAL,
	plan: "docs/plans/loader.md",
	reviewer: "fable",
};

const EMPTY_CARRIED = {
	deviations: [],
	choices: [],
	unsure: [],
	preExisting: [],
};

interface Outcome {
	readonly status: string;
	readonly open?: readonly Record<string, unknown>[];
	readonly introduced?: readonly unknown[];
	readonly decisions?: readonly unknown[];
	readonly deferred?: readonly unknown[];
	readonly comment?: Record<string, unknown>;
	readonly carried: {
		readonly deviations: readonly unknown[];
		readonly choices: readonly unknown[];
		readonly unsure: readonly unknown[];
		readonly preExisting: readonly unknown[];
	};
	readonly passes: readonly Record<string, unknown>[];
}

const outcome = (result: unknown) => result as Outcome;

const finding = (over: Record<string, unknown> = {}) => ({
	id: "empty-path",
	kind: "P2",
	title: "Guard the empty path",
	path: "lib/loader.mjs",
	line: 12,
	scenario: "An empty path loads nothing and reports success.",
	evidence: "tests/loader.test.mts, red before the fix.",
	repair: "Return the loader's own error for an empty path.",
	preExisting: false,
	...over,
});

/** A finding as the run's account records it. */
const recorded = (verdict: string, reason?: string) => ({
	id: "empty-path",
	title: "Guard the empty path",
	path: "lib/loader.mjs",
	verdict,
	...(reason === undefined ? {} : { reason }),
});

const fixed = (over: Record<string, unknown> = {}) => ({
	deviations: [],
	choices: [],
	unsure: [],
	verification: "14 tests, 0 failures.",
	...over,
});

const verdict = (
	id: string,
	name = "CLOSED",
	reason = "The guard returns the error, and the reviewer's test passes.",
) => ({ id, verdict: name, reason });

const commented = () => ({
	counts: {
		doc: { inScope: 6, rewritten: 4, added: 1 },
		inline: { inScope: 3, rewritten: 2, added: 0, cut: 1 },
	},
	gaps: [
		{
			path: "src/loader.ts",
			line: 45,
			claim: "the cache is warmed before the first read",
			reason: "the warming runs in a process the change does not touch",
		},
	],
});

/** Whether a paragraph of a prompt is the findings, which are a JSON array. */
const isFindings = (paragraph: string) => paragraph.startsWith("[");

/**
 * The findings a fix brief or a closure launch carries: the one paragraph of
 * it that is a JSON array.
 */
function findingsIn(prompt: string): Record<string, unknown>[] {
	const blocks = prompt.split("\n\n").filter(isFindings);

	assert.equal(blocks.length, 1, prompt);

	return JSON.parse(blocks[0] ?? "") as Record<string, unknown>[];
}

/** A closure report that closes every finding its launch named. */
const closing = (prompt: string, over: Record<string, unknown> = {}) => ({
	verdicts: findingsIn(prompt).map((item) => verdict(String(item["id"]))),
	opened: [],
	...over,
});

interface Launch {
	readonly prompt: string;
	readonly type: string;
	readonly model?: string | undefined;
}

interface Reports {
	readonly findings?: readonly Record<string, unknown>[];
	readonly review?: null;
	readonly fix?: (
		prompt: string,
		pass: number,
	) => Record<string, unknown> | null;
	readonly close?: (
		prompt: string,
		pass: number,
	) => Record<string, unknown> | null;
	readonly comment?: null;
}

/** An agent callback that carries a run to clean except where `reports` says otherwise. */
function agents(reports: Reports = {}): Agent {
	let fixes = 0;
	let closes = 0;

	return async (prompt, options) => {
		if (options.agentType === "den:reviewer") {
			return reports.review === null
				? null
				: { findings: reports.findings ?? [] };
		}
		if (options.agentType === "den:comment-reviewer") {
			return reports.comment === null ? null : commented();
		}
		if (options.agentType === "den:closure-verifier") {
			closes += 1;
			return reports.close ? reports.close(prompt, closes) : closing(prompt);
		}
		assert.equal(options.agentType, "den:implementer");
		fixes += 1;
		return reports.fix ? reports.fix(prompt, fixes) : fixed();
	};
}

/**
 * Runs the workflow on `args` with `reports` behind its agents, and returns
 * the launches it made, in order, with the run's result.
 */
async function record(
	args: Record<string, unknown>,
	reports: Reports = {},
): Promise<{ launches: Launch[]; result: Outcome }> {
	const launches: Launch[] = [];
	const run = agents(reports);
	const result = await runWorkflow(
		"review-and-fix-workflow",
		args,
		async (prompt, options) => {
			launches.push({ prompt, type: options.agentType, model: options.model });
			return run(prompt, options);
		},
	);

	return { launches, result: outcome(result) };
}

/**
 * Runs the workflow on `args` with `reports` behind its agents, asserts that
 * it fails, and returns the agent types it launched before it did.
 */
async function failing(
	args: Record<string, unknown>,
	reports: Reports = {},
): Promise<string[]> {
	const launched: string[] = [];
	const run = agents(reports);

	await assert.rejects(
		runWorkflow("review-and-fix-workflow", args, async (prompt, options) => {
			launched.push(options.agentType);
			return run(prompt, options);
		}),
	);

	return launched;
}

const types = (launches: readonly Launch[]) =>
	launches.map((launch) => launch.type);

/** Returns the launch at `index`, and fails the test when the run made fewer. */
function launch(launches: readonly Launch[], index: number): Launch {
	const made = launches[index];

	assert.ok(made, `the run made ${launches.length} launches, not ${index + 1}`);

	return made;
}

const REVIEW = "den:reviewer";
const FIX = "den:implementer";
const CLOSE = "den:closure-verifier";
const COMMENT = "den:comment-reviewer";

test("invalid review-and-fix-workflow arguments are rejected before any agent launches", async () => {
	const rejected: readonly Record<string, unknown>[] = [
		{},
		{ ...ARGS, repo: "loader" },
		{ ...ARGS, goal: " " },
		{ ...ARGS, plan: "" },
		{ ...ARGS, reviewer: "haiku" },
		{ ...ARGS, rulings: "one decision" },
		{ ...ARGS, rulings: ["x".repeat(401)] },
		{ ...ARGS, leadCalls: "one call" },
		{ ...ARGS, leadCalls: [" "] },
		// Anything but a full lowercase id; see the `since` check in the
		// workflow.
		{ ...ARGS, since: "HEAD" },
		{ ...ARGS, since: "3f08ff8" },
		{ ...ARGS, since: "3F08FF8".padEnd(40, "0") },
		{ ...ARGS, since: 7 },
		// A key the workflow does not take is rejected, however plausible.
		{ ...ARGS, fixRounds: 3 },
		{ ...ARGS, answers: {} },
	];

	for (const args of rejected) {
		assert.deepEqual(
			await failing(args),
			[],
			"an invalid launch reached an agent",
		);
	}
});

test("the reviewer runs on the model the launch names, every launch is told the repository, and the plan reaches the agents that read it only when the launch carries one", async () => {
	const { launches } = await record(ARGS, { findings: [finding()] });

	assert.deepEqual(types(launches), [REVIEW, FIX, CLOSE, COMMENT]);
	assert.equal(launch(launches, 0).model, "fable");
	for (const made of launches) {
		assert.ok(made.prompt.includes(REPO), made.type);
	}
	for (const index of [0, 1, 2]) {
		const made = launch(launches, index);

		assert.ok(made.prompt.includes(ARGS.plan), made.type);
	}

	const { plan: _, ...unplanned } = ARGS;
	const bare = await record(
		{ ...unplanned, reviewer: "opus" },
		{ findings: [finding()] },
	);

	assert.equal(launch(bare.launches, 0).model, "opus");
	for (const made of bare.launches) {
		assert.ok(made.prompt.includes(REPO), made.type);
		assert.ok(!made.prompt.includes(ARGS.plan), made.type);
	}
});

// The comment pass opens no finding, so neither list reaches it: a decision on
// them is nothing its rewrite could contradict.
test("the user's decisions and the lead's calls reach the reviewer, the fixer and the verifier", async () => {
	const rulings = [
		"The loader keeps the flag, since the caller has no cache path.",
		"The error is the loader's own, the user having said so.",
	];
	const leadCalls = ["The retry stays at one, since the cache is local."];
	const settled = [...rulings, ...leadCalls];
	const { launches } = await record(
		{ ...ARGS, rulings, leadCalls },
		{ findings: [finding()] },
	);

	assert.deepEqual(types(launches), [REVIEW, FIX, CLOSE, COMMENT]);
	for (const index of [0, 1, 2]) {
		const made = launch(launches, index);

		for (const entry of settled) {
			assert.ok(made.prompt.includes(entry), made.type);
		}
	}

	const comment = launch(launches, 3);

	for (const entry of settled) {
		assert.ok(!comment.prompt.includes(entry), comment.type);
	}
});

test("a run given a snapshot reviews, fixes and verifies against it, and launches the agents a run on the whole change does", async () => {
	const since = "0482f7aad6c5e4f154f711f86138b7bbf7a6ac5e";
	const { launches } = await record(
		{ ...ARGS, since },
		{ findings: [finding()] },
	);

	assert.deepEqual(types(launches), [REVIEW, FIX, CLOSE, COMMENT]);
	for (const index of [0, 1, 2]) {
		const made = launch(launches, index);

		assert.ok(made.prompt.includes(since), made.type);
	}
});

test("the closure verifier runs on the model the review was launched with", async () => {
	for (const reviewer of ["fable", "opus"]) {
		const { launches } = await record(
			{ ...ARGS, reviewer },
			{ findings: [finding()] },
		);
		const closure = launch(launches, 2);

		assert.equal(closure.type, CLOSE);
		assert.equal(closure.model, reviewer);
	}
});

test("a finding the closure opens below the fixed line is deferred, a decision is the lead's, and the run goes on", async () => {
	const minor = finding({ id: "log-line", kind: "P3" });
	const choice = finding({ id: "stored-format", kind: "decision" });
	const { launches, result } = await record(ARGS, {
		findings: [finding()],
		close: (prompt) => closing(prompt, { opened: [minor, choice] }),
	});

	assert.deepEqual(types(launches), [REVIEW, FIX, CLOSE, COMMENT]);
	assert.equal(result.status, "clean");
	assert.equal(result.introduced, undefined);
	assert.deepEqual(result.deferred, [minor]);
	assert.deepEqual(result.decisions, [choice]);
});

test("one fixer takes the defects at P2 and above as one brief, and everything else returns to the lead", async () => {
	const blocker = finding({ id: "lost-write", kind: "P0" });
	const defect = finding();
	const minor = finding({ id: "log-line", kind: "P3" });
	const pattern = finding({ id: "flag-name", kind: "quality" });
	const decision = finding({ id: "stored-format", kind: "decision" });
	const old = finding({ id: "old-guard", kind: "P1", preExisting: true });
	const { launches, result } = await record(ARGS, {
		findings: [minor, blocker, decision, defect, pattern, old],
	});

	assert.deepEqual(types(launches), [REVIEW, FIX, CLOSE, COMMENT]);
	assert.deepEqual(findingsIn(launch(launches, 1).prompt), [blocker, defect]);
	assert.deepEqual(findingsIn(launch(launches, 2).prompt), [blocker, defect]);
	assert.equal(result.status, "clean");
	assert.deepEqual(result.deferred, [minor, pattern]);
	assert.deepEqual(result.decisions, [decision]);
	assert.deepEqual(result.carried, { ...EMPTY_CARRIED, preExisting: [old] });
	assert.equal(result.open, undefined);
});

test("a review with nothing at P2 or above runs no fixer and no closure, and the comment pass lands the run", async () => {
	const minor = finding({ id: "log-line", kind: "P3" });
	const { launches, result } = await record(ARGS, { findings: [minor] });

	assert.deepEqual(types(launches), [REVIEW, COMMENT]);
	assert.equal(result.status, "clean");
	assert.deepEqual(result.deferred, [minor]);
	assert.deepEqual(result.passes, []);
	assert.deepEqual(result.comment, commented());
});

test("a reopened finding gets one more pass, carrying why it was reopened, and closes at the second closure", async () => {
	const why =
		"The guard covers the caller; the cache path still reaches the loader.";
	const { launches, result } = await record(ARGS, {
		findings: [finding()],
		close: (prompt, pass) =>
			closing(prompt, {
				verdicts: [
					verdict("empty-path", pass === 1 ? "REOPENED" : "CLOSED", why),
				],
			}),
	});

	assert.deepEqual(types(launches), [REVIEW, FIX, CLOSE, FIX, CLOSE, COMMENT]);
	assert.deepEqual(findingsIn(launch(launches, 3).prompt), [
		{ ...finding(), reopened: why },
	]);
	assert.deepEqual(findingsIn(launch(launches, 4).prompt), [
		{ ...finding(), reopened: why },
	]);
	assert.equal(result.status, "clean");
	assert.equal(result.open, undefined);
	assert.deepEqual(result.passes, [
		{ pass: 1, findings: [recorded("REOPENED", why)] },
		{ pass: 2, findings: [recorded("CLOSED")] },
	]);
});

test("a finding reopened twice returns open with its verdict and the last reason, and the comment pass does not run", async () => {
	const { launches, result } = await record(ARGS, {
		findings: [finding()],
		close: (prompt, pass) =>
			closing(prompt, {
				verdicts: [
					verdict("empty-path", "REOPENED", `Still short, pass ${pass}.`),
				],
			}),
	});

	assert.deepEqual(types(launches), [REVIEW, FIX, CLOSE, FIX, CLOSE]);
	assert.equal(result.status, "open");
	assert.deepEqual(result.open, [
		{ ...finding(), verdict: "REOPENED", reason: "Still short, pass 2." },
	]);
	assert.equal(result.comment, undefined);
});

test("a finding the fixes introduced ends the run before another pass, beside what was reopened", async () => {
	const made = finding({
		id: "cache-path",
		kind: "P1",
		title: "Guard the cache path",
	});
	const { launches, result } = await record(ARGS, {
		findings: [finding()],
		close: (prompt) =>
			closing(prompt, {
				verdicts: [
					verdict("empty-path", "REOPENED", "The cache path is open."),
				],
				opened: [made],
			}),
	});

	assert.deepEqual(types(launches), [REVIEW, FIX, CLOSE]);
	assert.equal(result.status, "open");
	assert.deepEqual(result.introduced, [made]);
	assert.deepEqual(result.open, [
		{ ...finding(), verdict: "REOPENED", reason: "The cache path is open." },
	]);
	assert.equal(result.comment, undefined);
});

test("a pre-existing finding the closure opens is carried, and the run goes on", async () => {
	const old = finding({ id: "old-guard", kind: "P1", preExisting: true });
	const { launches, result } = await record(ARGS, {
		findings: [finding()],
		close: (prompt) => closing(prompt, { opened: [old] }),
	});

	assert.deepEqual(types(launches), [REVIEW, FIX, CLOSE, COMMENT]);
	assert.equal(result.status, "clean");
	assert.equal(result.introduced, undefined);
	assert.deepEqual(result.carried, { ...EMPTY_CARRIED, preExisting: [old] });
});

test("a finding the closure cannot decide waits on the lead while a reopened one gets its pass", async () => {
	const why = "Whether the caller owns the flag is the user's.";
	const other = finding({ id: "cache-path", title: "Guard the cache path" });
	const { launches, result } = await record(ARGS, {
		findings: [finding(), other],
		close: (prompt, pass) =>
			pass === 1
				? closing(prompt, {
						verdicts: [
							verdict("empty-path", "NEEDS-DECISION", why),
							verdict("cache-path", "REOPENED", "The cache path is open."),
						],
					})
				: closing(prompt),
	});

	assert.deepEqual(types(launches), [REVIEW, FIX, CLOSE, FIX, CLOSE]);
	assert.deepEqual(findingsIn(launch(launches, 4).prompt), [
		{ ...other, reopened: "The cache path is open." },
	]);
	assert.equal(result.status, "open");
	assert.deepEqual(result.open, [
		{ ...finding(), verdict: "NEEDS-DECISION", reason: why },
	]);
	assert.equal(result.comment, undefined);
	assert.deepEqual(result.passes, [
		{
			pass: 1,
			findings: [
				recorded("NEEDS-DECISION", why),
				{
					...recorded("REOPENED", "The cache path is open."),
					id: "cache-path",
					title: "Guard the cache path",
				},
			],
		},
		{
			pass: 2,
			findings: [
				{
					...recorded("CLOSED"),
					id: "cache-path",
					title: "Guard the cache path",
				},
			],
		},
	]);
});

test("a closure that leaves a finding without a verdict, or judges one the pass was not fixing, fails at its stage", async () => {
	const reports: readonly Record<string, unknown>[] = [
		{ verdicts: [], opened: [] },
		{ verdicts: [verdict("empty-path"), verdict("cache-path")], opened: [] },
	];

	for (const report of reports) {
		assert.deepEqual(
			await failing(ARGS, { findings: [finding()], close: () => report }),
			[REVIEW, FIX, CLOSE],
		);
	}
});

test("a report that gives one id to two items is rejected at its stage", async () => {
	assert.deepEqual(await failing(ARGS, { findings: [finding(), finding()] }), [
		REVIEW,
	]);
	assert.deepEqual(
		await failing(ARGS, {
			findings: [finding()],
			close: () => ({
				verdicts: [verdict("empty-path")],
				opened: [finding({ id: "twice" }), finding({ id: "twice" })],
			}),
		}),
		[REVIEW, FIX, CLOSE],
	);
});

test("an agent that returns nothing usable ends the run at its own stage", async () => {
	const findings = [finding()];

	assert.deepEqual(await failing(ARGS, { review: null }), [REVIEW]);
	assert.deepEqual(await failing(ARGS, { findings, fix: () => null }), [
		REVIEW,
		FIX,
	]);
	assert.deepEqual(await failing(ARGS, { findings, close: () => null }), [
		REVIEW,
		FIX,
		CLOSE,
	]);
	assert.deepEqual(await failing(ARGS, { findings, comment: null }), [
		REVIEW,
		FIX,
		CLOSE,
		COMMENT,
	]);
});

test("the run's account is each pass's findings with their verdicts, and nothing a fixer or a verifier wrote beside them", async () => {
	const prose = "p".repeat(900);
	const { result } = await record(ARGS, {
		findings: [finding()],
		fix: () => fixed({ verification: prose }),
		close: (prompt) =>
			closing(prompt, { verdicts: [verdict("empty-path", "CLOSED", prose)] }),
	});

	assert.deepEqual(result.passes, [
		{ pass: 1, findings: [recorded("CLOSED")] },
	]);
	assert.ok(!JSON.stringify(result).includes(prose));
});

test("the fixers' declarations are carried across both passes", async () => {
	const deviation = {
		what: "The guard is in the caller",
		forcedBy: "the loader has no cache path",
		where: "lib/loader.mjs:4",
	};
	const choice = { chose: "a throw", over: "a null return" };
	const doubt = { what: "the cache path", why: "no test reaches it" };
	const { result } = await record(ARGS, {
		findings: [finding()],
		fix: (_prompt, pass) =>
			pass === 1
				? fixed({ deviations: [deviation], choices: [choice] })
				: fixed({ unsure: [doubt] }),
		close: (prompt, pass) =>
			closing(prompt, {
				verdicts: [verdict("empty-path", pass === 1 ? "REOPENED" : "CLOSED")],
			}),
	});

	assert.deepEqual(result.carried, {
		deviations: [deviation],
		choices: [choice],
		unsure: [doubt],
		preExisting: [],
	});
});

test("the return leads with what the lead acts on and leaves out every list with nothing in it", async () => {
	const clean = await record(ARGS);

	assert.deepEqual(Object.keys(clean.result), [
		"status",
		"comment",
		"carried",
		"passes",
	]);

	const decision = finding({ id: "stored-format", kind: "decision" });
	const { result } = await record(ARGS, {
		findings: [decision, finding(), finding({ id: "log-line", kind: "P3" })],
		close: (prompt) =>
			closing(prompt, { opened: [finding({ id: "cache-path" })] }),
	});

	assert.deepEqual(Object.keys(result), [
		"status",
		"introduced",
		"decisions",
		"deferred",
		"carried",
		"passes",
	]);
});

test("a fix pass logs a line", async () => {
	const logged: string[] = [];
	await runWorkflow(
		"review-and-fix-workflow",
		ARGS,
		agents({ findings: [finding()] }),
		(message) => {
			logged.push(message);
		},
	);

	assert.equal(logged.length, 1);
});

test("a return past what the host shows logs a line and still returns", async () => {
	const logged: string[] = [];
	const decision = finding({
		id: "stored-field",
		kind: "decision",
		scenario: "x".repeat(9000),
	});
	const result = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			ARGS,
			agents({ findings: [decision] }),
			(message) => {
				logged.push(message);
			},
		),
	);

	assert.equal(result.status, "clean");
	assert.equal(logged.length, 1);

	// A return inside the budget logs nothing.
	await runWorkflow("review-and-fix-workflow", ARGS, agents({}), (message) => {
		logged.push(message);
	});
	assert.equal(logged.length, 1);
});

test("an explorer's challenge to a settled decision reaches the judge and the result under contested", async () => {
	const contested = [
		{ decision: 1, reason: "The code already owns the host boundary." },
	];
	let judged = "";
	const result = (await runWorkflow(
		"design-exploration-workflow",
		{ ...EXPLORE, decisions: DECISIONS },
		async (prompt, options) => {
			if (options.agentType === "den:design-explorer") {
				assert.ok(options.schema?.required.includes("contested"));
				return { ...proposal(), contested };
			}
			judged = prompt;
			return {
				...noSuitableProposal(),
				outcome: "recommendation",
				recommendation: 1,
				ranking: [{ index: 1, rank: 1, strengths: "Fits", costs: "One seam" }],
				questions: [],
			};
		},
	)) as { designs: readonly { design: Record<string, unknown> }[] };

	for (const { design } of [...designsIn(judged), ...result.designs]) {
		assert.deepEqual(design["contested"], contested);
	}
});

test("an explorer's challenge naming a decision the settled list does not have fails the run", async () => {
	// Two decisions are settled in the first run and none in the second, so a
	// challenge to a third names nothing the judge or the user can reopen.
	for (const decisions of [DECISIONS, undefined]) {
		await assert.rejects(
			runWorkflow(
				"design-exploration-workflow",
				{ ...EXPLORE, decisions },
				async (_prompt, options) =>
					options.agentType === "den:design-explorer"
						? {
								...proposal(),
								contested: [
									{ decision: 3, reason: "The code owns the boundary." },
								],
							}
						: noSuitableProposal(),
			),
		);
	}
});

/** The comment pass's launch schema, over the keys these tests assert on. */
interface CommentSchema {
	readonly properties: {
		readonly counts: {
			readonly properties: Record<
				string,
				{ readonly required: readonly string[] }
			>;
		};
		readonly gaps: { readonly items: { readonly required: readonly string[] } };
	};
}

async function commentSchema(): Promise<CommentSchema> {
	let schema: unknown;
	const run = agents({});
	await runWorkflow(
		"review-and-fix-workflow",
		ARGS,
		async (prompt, options) => {
			if (options.agentType === "den:comment-reviewer") {
				schema = options.schema;
			}
			return run(prompt, options);
		},
	);

	return schema as CommentSchema;
}

test("every prose field the run's schemas carry is capped", async () => {
	const schemas: Record<string, unknown> = {};
	const run = agents({
		findings: [finding()],
		close: (prompt, pass) =>
			closing(prompt, {
				verdicts: [verdict("empty-path", pass === 1 ? "REOPENED" : "CLOSED")],
			}),
	});
	await runWorkflow(
		"review-and-fix-workflow",
		ARGS,
		async (prompt, options) => {
			schemas[options.agentType] = options.schema;
			return run(prompt, options);
		},
	);

	// A finding ran to 1,100 characters written for a stranger, and a length
	// in a description moved only the fields short enough to hold a phrase.
	// The host makes an agent that overruns a cap retry, which a description
	// cannot.
	const at = (type: string, path: readonly string[]) =>
		path.reduce<unknown>(
			(node, key) => (node as Record<string, unknown>)[key],
			schemas[type],
		) as { maxLength?: number };
	const finding_ = ["properties", "findings", "items", "properties"];
	const caps: readonly (readonly [string, readonly string[], number])[] = [
		[REVIEW, [...finding_, "title"], 100],
		[REVIEW, [...finding_, "scenario"], 300],
		[REVIEW, [...finding_, "evidence"], 250],
		[REVIEW, [...finding_, "repair"], 250],
		[FIX, ["properties", "choices", "items", "properties", "chose"], 150],
		[FIX, ["properties", "choices", "items", "properties", "over"], 150],
		[FIX, ["properties", "deviations", "items", "properties", "what"], 150],
		[FIX, ["properties", "deviations", "items", "properties", "forcedBy"], 250],
		[FIX, ["properties", "unsure", "items", "properties", "what"], 150],
		[FIX, ["properties", "unsure", "items", "properties", "why"], 250],
		[CLOSE, ["properties", "verdicts", "items", "properties", "reason"], 250],
		[CLOSE, ["properties", "opened", "items", "properties", "scenario"], 300],
		[COMMENT, ["properties", "gaps", "items", "properties", "claim"], 150],
		[COMMENT, ["properties", "gaps", "items", "properties", "reason"], 250],
	];
	for (const [type, path, cap] of caps) {
		assert.equal(at(type, path).maxLength, cap, `${type} ${path.join(".")}`);
	}
});

test("a gap names the line of the comment it stands on", async () => {
	const schema = await commentSchema();

	// The lead's commit proposal puts each gap to the user, and a ruling against
	// the claim sends the lead back to that comment. `claim` is a paraphrase: the
	// path alone finds the file, not the comment.
	assert.ok(schema.properties.gaps.items.required.includes("line"));
});

test("an inline comment the pass adds has a count to land in", async () => {
	const schema = await commentSchema();

	// A guard found in a doc comment moves to the site it guards, which writes
	// an inline comment that was not in scope.
	assert.ok(
		schema.properties.counts.properties["inline"]?.required.includes("added"),
	);
});

test("no id in the return names two items", async () => {
	const minor = finding({ id: "cache-path", kind: "P3" });
	const { result } = await record(ARGS, {
		findings: [finding(), minor],
		close: (prompt) =>
			closing(prompt, {
				opened: [finding({ id: "cache-path", title: "Guard the cache path" })],
			}),
	});

	// The lead rules on every item the return holds under its id, so the check
	// `checkIds` makes inside one agent's report has to hold across the return.
	const ids = [
		...(result.open ?? []),
		...(result.introduced ?? []),
		...(result.decisions ?? []),
		...(result.deferred ?? []),
		...result.carried.preExisting,
	].map((item) => (item as { id: string }).id);

	assert.deepEqual(
		[...new Set(ids)],
		ids,
		`the return holds ${ids.join(", ")}`,
	);
});
