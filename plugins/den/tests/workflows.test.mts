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

const EXPLORE = { ask: "Add a host", direction: DIRECTION };

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
			assert.ok(prompt.includes(`Direction record: ${DIRECTION}`));
			assert.ok(
				prompt.includes(
					`Settled decisions:
1. ${DECISIONS[0]}
2. ${DECISIONS[1]}`,
				),
			);
			if (options.agentType === "den:design-explorer") {
				explorers += 1;
				assert.ok(options.schema?.required.includes("questions"));
				assert.ok(options.schema?.required.includes("assumptions"));
				return { ...proposal(), status: "needs-input", questions, assumptions };
			}
			judges += 1;
			assert.equal(explorers, 3);
			assert.ok(prompt.includes(questions[0] ?? "missing question"));
			assert.ok(prompt.includes(assumptions[0] ?? "missing assumption"));
			assert.ok(options.schema?.required.includes("outcome"));
			return verdict;
		},
	);
	assert.equal(judges, 1);
	assert.deepEqual((result as { ranking: unknown }).ranking, verdict);
});

test("the direction record and the decision list are checked before dispatch", async () => {
	const rejected: readonly (readonly [Record<string, unknown>, RegExp])[] = [
		[{ direction: undefined }, /direction/],
		[{ direction: 7 }, /direction/],
		[{ direction: " " }, /direction/],
		// A relative path resolves against the tree the run was launched from.
		[{ direction: "docs/project-direction.md" }, /direction/],
		[{ decisions: "The loader owns the host registry" }, /decisions/],
		[{ decisions: [7] }, /decisions/],
		[{ decisions: [" "] }, /decisions/],
		[{ decisions: ["x".repeat(401)] }, /decisions/],
		[{ basis: "Two hosts, independently maintained" }, /nothing else/],
	];

	for (const [override, message] of rejected) {
		await assert.rejects(
			runWorkflow(
				"design-exploration-workflow",
				{ ...EXPLORE, ...override },
				async () => {
					assert.fail("invalid context must not launch an agent");
				},
			),
			message,
		);
	}
});

test("a launch with no settled decision carries no decision list", async () => {
	for (const decisions of [undefined, []]) {
		await runWorkflow(
			"design-exploration-workflow",
			{ ...EXPLORE, decisions },
			async (prompt, options) => {
				assert.ok(!prompt.includes("Settled decisions"));

				return options.agentType === "den:design-explorer"
					? proposal()
					: noSuitableProposal();
			},
		);
	}
});

test("a missing design result cannot become a smaller successful comparison", async () => {
	let index = 0;
	await assert.rejects(
		runWorkflow(
			"design-exploration-workflow",
			EXPLORE,
			async (_prompt, options) => {
				assert.equal(options.agentType, "den:design-explorer");
				return index++ === 1 ? null : proposal();
			},
		),
		/incomplete/i,
	);
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
			/recommendation/i,
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
			/Invalid recommendation/,
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
	fixRounds: 3,
};

/** The scope block every launch opens with, as the workflow composes it. */
const SCOPE = `Repository: ${REPO}
Range: HEAD

Every command runs there and every search names a path under it: the directory
you start in may be another tree.`;

const EMPTY_CARRIED = {
	deviations: [],
	choices: [],
	unsure: [],
	preExisting: [],
	asides: [],
};

interface Outcome {
	readonly status: string;
	readonly stop?: number;
	readonly at?: string;
	readonly round?: number;
	readonly rounds?: readonly Record<string, unknown>[];
	readonly comment?: Record<string, unknown>;
	readonly built?: string;
	readonly verification?: string;
	readonly fixes?: readonly unknown[];
	readonly questions?: readonly unknown[];
	readonly decisions?: readonly unknown[];
	readonly contested?: readonly unknown[];
	readonly restructure?: readonly unknown[];
	readonly undecided?: readonly unknown[];
	readonly fixRounds?: readonly unknown[];
	readonly open?: readonly unknown[];
	readonly removal?: readonly unknown[];
	readonly carried: Record<string, readonly unknown[]>;
}

const outcome = (result: unknown) => result as Outcome;

const reviewed = (over: Record<string, unknown> = {}) => ({
	findings: [],
	cleared: "The loader, its callers and its tests.",
	questions: [],
	...over,
});

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
	tier: "haiku",
	...over,
});

/** A finding ruled skip, narrowed to what a round record shows as removed. */
const removedRecord = ({
	id,
	title,
	path,
	line,
	tier,
}: Record<string, unknown>) => ({ id, title, path, line, tier });

/** An open finding, as a stop shows one it holds no item on. */
const openRecord = ({
	id,
	title,
	path,
	kind,
	tier,
}: Record<string, unknown>) => ({ id, title, path, kind, tier });

const asked = (over: Record<string, unknown> = {}) => ({
	id: "flag-owner",
	question: "Whose call is the flag?",
	effect: "The guard moves to the caller",
	changesCode: true,
	...over,
});

const question = (index: number, over: Record<string, unknown> = {}) => ({
	id: `guard-${index}`,
	finding: "empty-path",
	question: `Does the guard own cache path ${index}?`,
	evidence: `lib/loader.mjs:${index}`,
	alternatives: [{ option: "Keep it in the loader", cost: "One more branch" }],
	waits: `The cache path ${index}`,
	...over,
});

const fixed = (over: Record<string, unknown> = {}) => ({
	built: "The guard is in the loader, with its test.",
	questions: [],
	contested: [],
	deviations: [],
	choices: [],
	unsure: [],
	verification: "14 tests, 0 failures.",
	...over,
});

/** A fixer's report as a stop inside its own round carries it. */
const fixRecord = (
	tier: string,
	report: Record<string, unknown> = fixed(),
) => ({
	tier,
	built: report["built"],
	verification: report["verification"],
});

/** A fixer's report as a judged round's record keeps it. */
const verifiedRecord = (
	tier: string,
	report: Record<string, unknown> = fixed(),
) => ({
	tier,
	verification: report["verification"],
});

const closed = (over: Record<string, unknown> = {}) => ({
	verdicts: [],
	opened: [],
	restructure: [],
	...over,
});

const verdict = (id: string, name = "CLOSED") => ({
	id,
	verdict: name,
	reason: "The guard returns the error, and the reviewer's test passes.",
});

const restructured = (over: Record<string, unknown> = {}) => ({
	id: "guard-shape",
	units: "lib/loader.mjs",
	path: "lib/loader.mjs",
	line: 4,
	mechanisms: "the cache path and the caller",
	patches: "round 1 guarded the caller, round 2 guarded the cache path",
	...over,
});

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

const FINDINGS = "which settles what the fix does.";
const SKIPPED = "The lead ruled these findings skip.";
const RESTRUCTURE = "A finding of kind `restructure`";
const OPEN = "names it by:";
const ROUNDS =
	"The rounds before this one, each with the findings it fixed and the verdicts they ended in, and under `removed` the skipped findings whose tests it took out:";
const ANSWERS =
	"Questions answered earlier in this run, each under the id its asker gave it:";
const REPORT = "The report it stopped with:";
const THREAD = "Every question raised on these findings, each with its answer:";

/**
 * The JSON a prompt carries under `heading`, which runs to the blank line that
 * starts the next section.
 */
function blockIn(prompt: string, heading: string): unknown {
	const start = prompt.indexOf(heading);

	assert.notEqual(start, -1, `the prompt carries nothing under "${heading}"`);

	const from = start + heading.length;
	const end = prompt.indexOf("\n\n", from + 2);

	return JSON.parse(prompt.slice(from, end === -1 ? undefined : end));
}

const findingsIn = (prompt: string) =>
	blockIn(prompt, FINDINGS) as Record<string, unknown>[];

/**
 * What a fix brief or a closure launch says about the findings ruled skip, and
 * the findings it lists under it.
 */
function removalIn(prompt: string): {
	instruction: string;
	findings: Record<string, unknown>[];
} {
	const paragraphs = prompt.split("\n\n");
	const at = paragraphs.findIndex((paragraph) => paragraph.startsWith(SKIPPED));

	assert.notEqual(at, -1, "the brief lists no findings ruled skip");

	return {
		instruction: paragraphs[at] ?? "",
		findings: JSON.parse(paragraphs[at + 1] ?? "null"),
	};
}

const roundsIn = (prompt: string) =>
	blockIn(prompt, ROUNDS) as Record<string, unknown>[];

const answersIn = (prompt: string) =>
	blockIn(prompt, ANSWERS) as Record<string, unknown>[];

const stateIn = (prompt: string) =>
	blockIn(prompt, REPORT) as Record<string, unknown>;

const threadIn = (prompt: string) =>
	blockIn(prompt, THREAD) as Record<string, unknown>[];

/** The findings a closure launch names, empty when the round had none open. */
const openIn = (prompt: string) =>
	prompt.includes(OPEN)
		? (blockIn(prompt, OPEN) as Record<string, unknown>[])
		: [];

/** A closure report that closes every finding its launch named. */
const closing = (prompt: string, over: Record<string, unknown> = {}) =>
	closed({
		verdicts: openIn(prompt).map((item) => verdict(String(item["id"]))),
		...over,
	});

interface Reports {
	readonly review?: Record<string, unknown>;
	readonly fix?: (
		prompt: string,
		type: string,
		launch: number,
	) => Record<string, unknown>;
	readonly close?: (prompt: string, round: number) => Record<string, unknown>;
}

/** An agent callback that carries a run to clean except where `reports` says otherwise. */
function agents(reports: Reports = {}): Agent {
	let fixes = 0;
	let closes = 0;

	return async (prompt, options) => {
		if (options.agentType === "den:reviewer") {
			return reports.review ?? reviewed();
		}
		if (options.agentType === "den:comment-reviewer") {
			return commented();
		}
		if (options.agentType === "den:closure-verifier") {
			closes += 1;
			return reports.close?.(prompt, closes) ?? closing(prompt);
		}
		fixes += 1;
		return reports.fix?.(prompt, options.agentType, fixes) ?? fixed();
	};
}

/** The prompts a run issued, in order, with the run's result. */
async function record(
	args: Record<string, unknown>,
	reports: Reports = {},
): Promise<{ prompts: string[]; result: Outcome }> {
	const prompts: string[] = [];
	const run = agents(reports);
	const result = await runWorkflow(
		"review-and-fix-workflow",
		args,
		async (prompt, options) => {
			prompts.push(prompt);
			return run(prompt, options);
		},
	);

	return { prompts, result: outcome(result) };
}

test("invalid review-and-fix-workflow arguments are rejected before any agent launches", async () => {
	const rejected: readonly (readonly [Record<string, unknown>, RegExp])[] = [
		[{ ...ARGS, repo: undefined }, /repo/],
		[{ ...ARGS, repo: "  " }, /repo/],
		// A relative path names whatever tree the agent reading it stands in.
		[{ ...ARGS, repo: "plugins/den" }, /repo/],
		[{ ...ARGS, goal: "  " }, /goal/],
		[{ ...ARGS, goal: undefined }, /goal/],
		[{ ...ARGS, plan: 7 }, /plan/],
		[{ ...ARGS, rulings: 7 }, /rulings/],
		[{ ...ARGS, rulings: ["x".repeat(401)] }, /rulings/],
		[{ ...ARGS, rulings: [" "] }, /rulings/],
		// The per-decision limit bites only where each decision is its own item.
		[{ ...ARGS, rulings: "The loader owns the guard" }, /rulings/],
		[{ ...ARGS, decisions: "The loader owns the guard" }, /nothing else/],
		[{ ...ARGS, reviewer: "haiku" }, /reviewer/],
		[{ ...ARGS, reviewer: undefined }, /reviewer/],
		[{ ...ARGS, fixRounds: 1.5 }, /fixRounds/],
		[{ ...ARGS, fixRounds: undefined }, /fixRounds/],
		[{ ...ARGS, answers: [["The loader owns it"]] }, /answers/],
		[{ ...ARGS, answers: { "guard-1": null } }, /answers/],
		[{ ...ARGS, basis: "The loader owns the guard" }, /nothing else/],
		[{ ...ARGS, brief: "Move the guard into the loader." }, /nothing else/],
		[{ ...ARGS, implementer: "opus" }, /nothing else/],
		[{ ...ARGS, range: "HEAD~1" }, /nothing else/],
	];

	for (const [args, message] of rejected) {
		await assert.rejects(
			runWorkflow("review-and-fix-workflow", args, async () => {
				assert.fail("invalid arguments must not launch an agent");
			}),
			message,
		);
	}
});

test("the reviewer reads the repository's working tree against HEAD, with the goal and the plan", async () => {
	const launched: {
		readonly type: string;
		readonly model: string | undefined;
	}[] = [];
	const run = agents();
	let scope = "";
	await runWorkflow(
		"review-and-fix-workflow",
		{ ...ARGS, reviewer: "opus" },
		async (prompt, options) => {
			launched.push({ type: options.agentType, model: options.model });
			if (options.agentType === "den:reviewer") {
				scope = prompt;
			}
			return run(prompt, options);
		},
	);

	assert.deepEqual(launched, [
		{ type: "den:reviewer", model: "opus" },
		{ type: "den:comment-reviewer", model: undefined },
	]);
	assert.equal(
		scope,
		`${SCOPE}\n\nGoal: ${GOAL}\n\nPlan: docs/plans/loader.md`,
	);

	const bare = await record({ ...ARGS, plan: undefined });

	assert.equal(bare.prompts[0], `${SCOPE}\n\nGoal: ${GOAL}`);
});

// Every agent inherits the session's working directory, so a lead reviewing a
// change in another checkout gets its own tree worked on unless each launch
// says where the work is.
test("every agent that works a tree is told which repository to work in", async () => {
	const { prompts, result } = await record(ARGS, {
		review: reviewed({ findings: [finding()] }),
	});

	assert.equal(result.status, "clean");
	// The reviewer, the haiku fixer, the closure verifier and the comment pass.
	assert.equal(prompts.length, 4);
	for (const prompt of prompts) {
		assert.ok(prompt.includes(SCOPE), prompt.slice(0, 80));
	}
});

test("the goal opens every fix brief and every closure launch", async () => {
	const openings: string[] = [];
	const keep = (prompt: string) => {
		openings.push(prompt);
		return undefined;
	};
	await runWorkflow(
		"review-and-fix-workflow",
		ARGS,
		agents({
			review: reviewed({
				findings: [finding(), finding({ id: "flag-name", tier: "opus" })],
			}),
			fix: (prompt) => {
				keep(prompt);
				return fixed();
			},
			close: (prompt) => {
				keep(prompt);
				return closing(prompt);
			},
		}),
	);

	assert.equal(openings.length, 3);
	for (const prompt of openings) {
		assert.ok(prompt.startsWith(`Goal: ${GOAL}`), prompt.slice(0, 60));
	}
});

test("what the lead has settled reaches every fixer and the closure verifier", async () => {
	const settled = "The loader owns the guard (user, 2026-09-14).";
	const carrying: string[] = [];
	const keep = (prompt: string) => {
		carrying.push(prompt);
	};
	await runWorkflow(
		"review-and-fix-workflow",
		{ ...ARGS, rulings: [settled] },
		agents({
			review: reviewed({
				findings: [finding(), finding({ id: "flag-name", tier: "opus" })],
			}),
			fix: (prompt) => {
				keep(prompt);
				return fixed();
			},
			close: (prompt) => {
				keep(prompt);
				return closing(prompt);
			},
		}),
	);

	assert.equal(carrying.length, 3);
	for (const prompt of carrying) {
		assert.ok(prompt.includes(`1. ${settled}`), prompt.slice(0, 60));
	}
});

test("the answer to a reviewer's question reaches the first fix brief and the first closure launch", async () => {
	const raised = asked();
	const answer = "The caller owns the flag.";
	const { prompts, result } = await record(
		{ ...ARGS, answers: { [raised.id]: answer } },
		{ review: reviewed({ findings: [finding()], questions: [raised] }) },
	);

	assert.equal(result.status, "clean");
	for (const prompt of [prompts[1] ?? "", prompts[2] ?? ""]) {
		assert.deepEqual(answersIn(prompt), [{ ...raised, answer }]);
	}
});

test("the answer to a fixer's question reaches that round's closure launch and the next round's fix brief", async () => {
	const judged = finding({ id: "flag-name", tier: "opus" });
	const raised = question(1, { finding: judged.id });
	const answer = "The loader owns it";
	const { prompts, result } = await record(
		{ ...ARGS, answers: { [raised.id]: answer } },
		{
			review: reviewed({ findings: [judged] }),
			fix: (_prompt, _type, launch) =>
				launch === 1 ? fixed({ questions: [raised] }) : fixed(),
			close: (prompt, round) =>
				round === 1
					? closed({ verdicts: [verdict(judged.id, "REOPENED")] })
					: closing(prompt),
		},
	);

	assert.equal(result.status, "clean");
	// The brief the question was asked from was built before the answer existed.
	assert.ok(!(prompts[1] ?? "").includes(ANSWERS));
	for (const prompt of [prompts[3] ?? "", prompts[4] ?? ""]) {
		assert.deepEqual(answersIn(prompt), [{ ...raised, answer }]);
	}
});

test("a run that answered no question carries no answered questions", async () => {
	const { prompts, result } = await record(ARGS, {
		review: reviewed({ findings: [finding()] }),
	});

	assert.equal(result.status, "clean");
	for (const prompt of prompts) {
		assert.ok(!prompt.includes(ANSWERS), prompt.slice(0, 60));
	}
});

test("a fix brief carries the findings as the reviewer worded them, and never a pre-existing one", async () => {
	const defect = finding();
	const old = finding({ id: "older-guard", preExisting: true });
	const { prompts, result } = await record(ARGS, {
		review: reviewed({ findings: [defect, old] }),
	});

	assert.equal(result.status, "clean");
	assert.deepEqual(findingsIn(prompts[1] ?? ""), [defect]);
	assert.deepEqual(result.carried["preExisting"], [old]);
});

test("a closure launch carries the rounds before it with their verdicts", async () => {
	const defect = finding();
	const closures: string[] = [];
	await runWorkflow(
		"review-and-fix-workflow",
		ARGS,
		agents({
			review: reviewed({ findings: [defect] }),
			close: (prompt, round) => {
				closures.push(prompt);
				return round === 1
					? closed({ verdicts: [verdict(defect.id, "REOPENED")] })
					: closing(prompt);
			},
		}),
	);

	assert.ok(!closures[0]?.includes(ROUNDS));
	assert.deepEqual(roundsIn(closures[1] ?? ""), [
		{
			round: 1,
			findings: [
				{
					id: defect.id,
					title: defect.title,
					path: defect.path,
					verdict: "REOPENED",
				},
			],
		},
	]);
});

test("a closure launch names what the round took out of the tree beside what it judged", async () => {
	const decision = finding({
		id: "stored-field",
		kind: "decision",
		tier: "opus",
	});
	const defect = finding();
	const { prompts, result } = await record(
		{ ...ARGS, answers: { "stored-field": { action: "skip" } } },
		{ review: reviewed({ findings: [decision, defect] }) },
	);
	const closure = prompts[2] ?? "";

	// A verifier not told of the deleted test reads that deletion as a fix that
	// opened something.
	assert.equal(result.status, "clean");
	assert.deepEqual(openIn(closure), [defect]);
	assert.deepEqual(removalIn(closure).findings, [decision]);
});

const cacheKey = () =>
	finding({ id: "cache-key", title: "Key the cache by path", line: 30 });

interface Launch {
	readonly type: string;
	readonly prompt: string;
}

/**
 * A run whose first closure closes its haiku defect, opens a haiku finding and
 * reports a restructure item, with every fixer launch recorded in `launches`.
 */
function restructureRun(launches: Launch[]): Reports {
	return {
		review: reviewed({ findings: [finding()] }),
		fix: (prompt, type) => {
			launches.push({ type, prompt });
			return fixed();
		},
		close: (prompt, round) =>
			round === 1
				? closed({
						verdicts: [verdict("empty-path")],
						opened: [cacheKey()],
						restructure: [restructured()],
					})
				: closing(prompt),
	};
}

test("a restructure item stops before the next fixer, and the stop's open list leaves it out", async () => {
	const launches: Launch[] = [];
	const stopped = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			ARGS,
			agents(restructureRun(launches)),
		),
	);

	assert.equal(stopped.at, "closure");
	assert.equal(stopped.round, 1);
	assert.deepEqual(stopped.restructure, [restructured()]);
	assert.equal(launches.length, 1);
	// A ruling of skip drops the item, so the list of what the next round takes
	// up however the stop is answered holds only the opened finding.
	assert.deepEqual(stopped.open, [openRecord(cacheKey())]);
});

test("a restructure item ruled fix is an Opus finding under its id, which the Opus fixer takes when every other open finding is haiku", async () => {
	const launches: Launch[] = [];
	const instruction = "Move the guard into the loader.";
	const answered = {
		...ARGS,
		answers: { "guard-shape": { action: "fix", instruction } },
	};
	const clean = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			answered,
			agents(restructureRun(launches)),
		),
	);

	assert.equal(clean.status, "clean");
	assert.deepEqual(
		launches.map((launch) => launch.type),
		["den:implementer-haiku", "den:implementer-haiku", "den:implementer-opus"],
	);

	const haikuBrief = launches[1]?.prompt ?? "";
	const opusBrief = launches[2]?.prompt ?? "";

	assert.deepEqual(findingsIn(haikuBrief), [cacheKey()]);
	assert.ok(!haikuBrief.includes(instruction));
	assert.ok(!haikuBrief.includes(RESTRUCTURE));

	const [taken, ...others] = findingsIn(opusBrief);
	const { id, kind, path, line, tier, evidence } = taken ?? {};

	assert.deepEqual(others, []);
	assert.deepEqual(
		{ id, kind, path, line, tier, instruction: taken?.["instruction"] },
		{
			id: "guard-shape",
			kind: "restructure",
			path: "lib/loader.mjs",
			line: 4,
			tier: "opus",
			instruction,
		},
	);
	// The brief says how a restructure finding is fixed only where it holds one.
	assert.ok(opusBrief.includes(RESTRUCTURE));

	const item = restructured();
	for (const part of [item.units, item.mechanisms, item.patches]) {
		assert.ok(String(evidence).includes(part));
	}
	// The answer reaches the fixer as the finding's instruction, and the brief
	// says it nowhere else.
	assert.equal(opusBrief.split(instruction).length, 2);
});

test("a restructure item ruled fix takes a verdict at the next closure pass, and a report without one fails", async () => {
	const defect = finding({ tier: "opus" });
	const answered = {
		...ARGS,
		answers: {
			"guard-shape": {
				action: "fix",
				instruction: "Move the guard into the loader.",
			},
		},
	};
	const first = () =>
		closed({ verdicts: [verdict(defect.id)], restructure: [restructured()] });
	const closures: string[] = [];

	const clean = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			answered,
			agents({
				review: reviewed({ findings: [defect] }),
				close: (prompt, round) => {
					closures.push(prompt);
					return round === 1 ? first() : closing(prompt);
				},
			}),
		),
	);

	assert.equal(clean.status, "clean");
	assert.deepEqual(
		openIn(closures[1] ?? "").map((pending) => pending["id"]),
		["guard-shape"],
	);

	await assert.rejects(
		runWorkflow(
			"review-and-fix-workflow",
			answered,
			agents({
				review: reviewed({ findings: [defect] }),
				close: (_prompt, round) => (round === 1 ? first() : closed()),
			}),
		),
		/left guard-shape without a verdict/,
	);
});

test("a restructure item ruled skip is dropped with nothing taken out of the tree, and one answered in text is rejected", async () => {
	const launches: Launch[] = [];
	const clean = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			{ ...ARGS, answers: { "guard-shape": { action: "skip" } } },
			agents(restructureRun(launches)),
		),
	);

	assert.equal(clean.status, "clean");
	// Round one's haiku fixer, then round two's on the opened finding alone.
	assert.deepEqual(
		launches.map((launch) => launch.type),
		["den:implementer-haiku", "den:implementer-haiku"],
	);

	const next = launches[1]?.prompt ?? "";

	assert.deepEqual(findingsIn(next), [cacheKey()]);
	// The item has no test in the tree, so no fixer is told to remove one.
	assert.ok(!next.includes(SKIPPED));

	await assert.rejects(
		runWorkflow(
			"review-and-fix-workflow",
			{
				...ARGS,
				answers: { "guard-shape": "Move the guard into the loader." },
			},
			agents(restructureRun([])),
		),
		/guard-shape is a finding and its answer is an `action`/,
	);
});

test("the findings ruled skip go to the first fixer the round runs, and to no later one", async () => {
	const decision = finding({
		id: "stored-field",
		kind: "decision",
		tier: "opus",
	});
	const defect = finding({ tier: "opus" });
	const briefs: string[] = [];
	const result = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			{ ...ARGS, answers: { "stored-field": { action: "skip" } } },
			agents({
				review: reviewed({ findings: [decision, defect] }),
				fix: (prompt) => {
					briefs.push(prompt);
					return fixed();
				},
				close: (prompt, round) =>
					round === 1
						? closed({ verdicts: [verdict(defect.id, "REOPENED")] })
						: closing(prompt),
			}),
		),
	);

	assert.equal(result.status, "clean");
	assert.deepEqual(removalIn(briefs[0] ?? "").findings, [decision]);
	assert.ok(!briefs[1]?.includes(SKIPPED));
});

test("a finding ruled skip is told what leaves the tree by its own evidence", async () => {
	const read = finding({
		id: "stored-field",
		kind: "decision",
		tier: "opus",
		evidence:
			"The loader reports success for an empty path, which its caller reads as loaded.",
	});
	const { prompts, result } = await record(
		{ ...ARGS, answers: { "stored-field": { action: "skip" } } },
		{ review: reviewed({ findings: [read] }) },
	);
	const { instruction, findings } = removalIn(prompts[1] ?? "");

	assert.equal(result.status, "clean");
	// A skip removes whatever the finding's own evidence names, so the finding
	// reaches the fixer whole and the instruction sends it to that field.
	assert.deepEqual(findings, [read]);
	assert.match(instruction, /`evidence`/);
	// This finding's evidence is a check in words, so the instruction has to
	// carry the branch where the tree holds no test to take out.
	assert.match(instruction, /nothing is removed/);
});

test("a round that only takes a test out of the tree launches no closure pass", async () => {
	const defect = finding({ tier: "opus" });
	const opened = finding({
		id: "stored-format",
		kind: "decision",
		title: "Store the path as text",
		tier: "opus",
	});
	const launched: string[] = [];
	const run = agents({
		review: reviewed({ findings: [defect] }),
		close: (prompt, round) =>
			round === 1 ? closing(prompt, { opened: [opened] }) : closing(prompt),
	});
	const result = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			{ ...ARGS, answers: { "stored-format": { action: "skip" } } },
			async (prompt, options) => {
				launched.push(options.agentType);
				return run(prompt, options);
			},
		),
	);

	// Round two took the skipped decision's test out and changed nothing else,
	// so it left no fix for a verifier to read.
	assert.equal(result.status, "clean");
	assert.equal(result.rounds?.length, 2);
	assert.deepEqual(launched, [
		"den:reviewer",
		"den:implementer-opus",
		"den:closure-verifier",
		"den:implementer-haiku",
		"den:comment-reviewer",
	]);
});

test("a round whose closure pass was skipped reaches the next one with what it removed", async () => {
	const defect = finding();
	const decision = finding({
		id: "stored-field",
		kind: "decision",
		tier: "opus",
	});
	const contested = {
		finding: defect.id,
		decision: "The loader owns the guard",
		reason: "The repair moves it to the caller.",
	};
	const { prompts, result } = await record(
		{
			...ARGS,
			answers: {
				"stored-field": { action: "skip" },
				"empty-path": { action: "fix", instruction: "Keep it in the loader." },
			},
		},
		{
			review: reviewed({ findings: [defect, decision] }),
			fix: (_prompt, _type, launch) =>
				launch === 1 ? fixed({ contested: [contested] }) : fixed(),
		},
	);

	assert.equal(result.status, "clean");
	assert.equal(result.rounds?.length, 2);
	// Round one had nothing left open to judge, so it ran no closure pass, and
	// the test it took out reaches a verifier only in its record.
	assert.deepEqual(roundsIn(prompts[3] ?? ""), [
		{
			round: 1,
			findings: [],
			removed: [removedRecord(decision)],
		},
	]);
});

test("a haiku question about a test to take out hands it to the same round's Opus fixer", async () => {
	const decision = finding({
		id: "stored-field",
		kind: "decision",
		tier: "haiku",
	});
	const launched: {
		readonly type: string;
		readonly removal: Record<string, unknown>[];
	}[] = [];
	const result = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			{ ...ARGS, answers: { "stored-field": { action: "skip" } } },
			agents({
				review: reviewed({ findings: [decision] }),
				fix: (prompt, type) => {
					launched.push({ type, removal: removalIn(prompt).findings });
					return type === "den:implementer-haiku"
						? fixed({
								questions: [question(1, { finding: "stored-field" })],
							})
						: fixed();
				},
			}),
		),
	);

	assert.equal(result.status, "clean");
	assert.deepEqual(launched, [
		{ type: "den:implementer-haiku", removal: [decision] },
		{ type: "den:implementer-opus", removal: [{ ...decision, tier: "opus" }] },
	]);
});

test("a decision finding or a question that changes the code stops the run before any fixer", async () => {
	const decision = finding({
		id: "stored-field",
		kind: "decision",
		tier: "opus",
	});
	const defect = finding();
	const old = finding({ id: "older-guard", preExisting: true });
	const stopping = [
		{
			review: reviewed({ findings: [decision, defect, old] }),
			decisions: [decision],
			questions: [],
		},
		{
			review: reviewed({ findings: [defect, old], questions: [asked()] }),
			decisions: [],
			questions: [asked()],
		},
	];

	for (const { review, decisions, questions } of stopping) {
		let fixers = 0;
		const result = outcome(
			await runWorkflow(
				"review-and-fix-workflow",
				ARGS,
				agents({
					review,
					fix: () => {
						fixers += 1;
						return fixed();
					},
				}),
			),
		);

		assert.equal(result.status, "stopped");
		assert.equal(result.at, "review");
		assert.equal(result.stop, 0);
		assert.equal(fixers, 0);
		assert.deepEqual(result.decisions, decisions);
		assert.deepEqual(result.questions, questions);
		assert.deepEqual(result.carried["preExisting"], [old]);
		// Nothing in the run built the tree, so the review stop holds no account
		// of what was built.
		assert.equal(result.built, undefined);
		assert.equal(result.verification, undefined);
	}
});

test("a ruling of skip takes the finding's test out of the tree and a ruling of fix carries the instruction", async () => {
	const decision = finding({
		id: "stored-field",
		kind: "decision",
		tier: "opus",
	});
	const brief = async (answer: Record<string, unknown>) => {
		const { prompts, result } = await record(
			{ ...ARGS, answers: { "stored-field": answer } },
			{ review: reviewed({ findings: [decision] }) },
		);

		assert.equal(result.status, "clean");

		return prompts[1] ?? "";
	};

	const skip = await brief({ action: "skip" });

	assert.deepEqual(removalIn(skip).findings, [decision]);
	assert.ok(!skip.includes(FINDINGS));

	const fix = await brief({ action: "fix", instruction: "Name it guardPath" });

	assert.deepEqual(findingsIn(fix), [
		{ ...decision, instruction: "Name it guardPath" },
	]);
	assert.ok(!fix.includes(SKIPPED));
});

test("a ruling of skip drops the finding, so an instruction on one is rejected at every stop", async () => {
	const decision = finding({
		id: "stored-field",
		kind: "decision",
		tier: "opus",
	});
	const defect = finding({ tier: "opus" });
	const opened = finding({
		id: "stored-format",
		kind: "decision",
		title: "Store the path as text",
		tier: "opus",
	});
	const dropped = { action: "skip", instruction: "Revert the guard." };
	// Every stop that rules on a finding no fixer has edited for: the review, a
	// contest, and a closure pass's opened decision and restructure item.
	const stops: readonly (readonly [Record<string, unknown>, Reports])[] = [
		[
			{ "stored-field": dropped },
			{ review: reviewed({ findings: [decision] }) },
		],
		[
			{ "empty-path": dropped },
			{
				review: reviewed({ findings: [defect] }),
				fix: (_prompt, _type, launch) =>
					launch === 1
						? fixed({
								contested: [
									{
										finding: defect.id,
										decision: "The loader owns the guard",
										reason: "The repair moves it to the caller.",
									},
								],
							})
						: fixed(),
			},
		],
		[
			{ "stored-format": dropped },
			{
				review: reviewed({ findings: [defect] }),
				close: (prompt, round) =>
					round === 1 ? closing(prompt, { opened: [opened] }) : closing(prompt),
			},
		],
		[
			{ "guard-shape": dropped },
			{
				review: reviewed({ findings: [defect] }),
				close: (prompt, round) =>
					round === 1
						? closing(prompt, { restructure: [restructured()] })
						: closing(prompt),
			},
		],
	];

	for (const [answers, reports] of stops) {
		await assert.rejects(
			runWorkflow(
				"review-and-fix-workflow",
				{ ...ARGS, answers },
				agents(reports),
			),
			/belongs on a ruling of fix/,
		);
	}
});

test("a round runs the haiku fixer on its own findings first, then the Opus fixer on the rest", async () => {
	const mechanical = finding();
	const judged = finding({ id: "flag-name", tier: "opus" });
	const launched: {
		readonly type: string;
		readonly findings: Record<string, unknown>[];
	}[] = [];
	const fix = (prompt: string, type: string) => {
		launched.push({ type, findings: findingsIn(prompt) });
		return fixed();
	};
	await runWorkflow(
		"review-and-fix-workflow",
		ARGS,
		agents({ review: reviewed({ findings: [mechanical, judged] }), fix }),
	);

	assert.deepEqual(launched, [
		{ type: "den:implementer-haiku", findings: [mechanical] },
		{ type: "den:implementer-opus", findings: [judged] },
	]);

	launched.length = 0;
	await runWorkflow(
		"review-and-fix-workflow",
		ARGS,
		agents({ review: reviewed({ findings: [judged] }), fix }),
	);

	assert.deepEqual(launched, [
		{ type: "den:implementer-opus", findings: [judged] },
	]);
});

test("a haiku question hands its finding to the same round's Opus fixer", async () => {
	const mechanical = finding();
	const launched: {
		readonly type: string;
		readonly findings: Record<string, unknown>[];
	}[] = [];
	const result = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			ARGS,
			agents({
				review: reviewed({ findings: [mechanical] }),
				fix: (prompt, type) => {
					launched.push({ type, findings: findingsIn(prompt) });
					return type === "den:implementer-haiku"
						? fixed({ questions: [question(1)] })
						: fixed();
				},
			}),
		),
	);

	assert.equal(result.status, "clean");
	assert.deepEqual(launched[1], {
		type: "den:implementer-opus",
		findings: [{ ...mechanical, tier: "opus" }],
	});
});

test("a reopened finding and a finding the closure opened make the next round's open list", async () => {
	const defect = finding();
	const opened = finding({
		id: "cache-path",
		title: "Guard the cache path",
		tier: "opus",
	});
	const briefs: Record<string, unknown>[][] = [];
	const result = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			ARGS,
			agents({
				review: reviewed({ findings: [defect] }),
				fix: (prompt) => {
					briefs.push(findingsIn(prompt));
					return fixed();
				},
				close: (prompt, round) =>
					round === 1
						? closed({
								verdicts: [verdict(defect.id, "REOPENED")],
								opened: [opened],
							})
						: closing(prompt),
			}),
		),
	);

	assert.equal(result.status, "clean");
	assert.equal(result.rounds?.length, 2);
	assert.deepEqual(briefs[0], [defect]);
	// Reopening moved the finding off the tier that could not close it.
	assert.deepEqual(briefs[1], [{ ...defect, tier: "opus" }, opened]);
});

test("a finding the closure opens under an open finding's id is renamed", async () => {
	const defect = finding({ id: "cache-path", tier: "opus" });
	const opened = finding({
		id: "cache-path",
		title: "Guard the cache key",
		tier: "opus",
	});
	const briefs: Record<string, unknown>[][] = [];
	await runWorkflow(
		"review-and-fix-workflow",
		ARGS,
		agents({
			review: reviewed({ findings: [defect] }),
			fix: (prompt) => {
				briefs.push(findingsIn(prompt));
				return fixed();
			},
			close: (prompt, round) =>
				round === 1
					? closed({
							verdicts: [verdict(defect.id, "REOPENED")],
							opened: [opened],
						})
					: closing(prompt),
		}),
	);

	assert.deepEqual(
		briefs[1]?.map((item) => item["id"]),
		["cache-path", "cache-path-2"],
	);
});

test("a finding the closure opens under an answered id is renamed, past the report's own ids", async () => {
	const decision = finding({
		id: "cache-path",
		kind: "decision",
		tier: "opus",
	});
	const opened = finding({
		id: "cache-path",
		title: "Guard the cache key",
		tier: "opus",
	});
	const sibling = finding({
		id: "cache-path-2",
		title: "Name the cache key",
		tier: "opus",
	});
	const briefs: Record<string, unknown>[][] = [];
	const clean = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			{ ...ARGS, answers: { "cache-path": { action: "fix" } } },
			agents({
				review: reviewed({ findings: [decision] }),
				fix: (prompt) => {
					briefs.push(findingsIn(prompt));
					return fixed();
				},
				close: (prompt, round) =>
					round === 1
						? closing(prompt, { opened: [opened, sibling] })
						: closing(prompt),
			}),
		),
	);

	assert.equal(clean.status, "clean");
	assert.deepEqual(
		briefs[1]?.map((item) => item["id"]),
		["cache-path-3", "cache-path-2"],
	);
});

test("the round cap stops the run, and its answer is how many more rounds to allow", async () => {
	const defect = finding({ tier: "opus" });
	const reports: Reports = {
		review: reviewed({ findings: [defect] }),
		close: (prompt, round) =>
			round < 3
				? closed({ verdicts: [verdict(defect.id, "REOPENED")] })
				: closing(prompt),
	};
	const capped = { ...ARGS, fixRounds: 1 };

	const first = outcome(
		await runWorkflow("review-and-fix-workflow", capped, agents(reports)),
	);

	assert.equal(first.at, "fixRounds");
	assert.equal(first.stop, 0);
	assert.equal(first.round, 1);
	assert.deepEqual(first.fixRounds, [{ id: "fix-rounds" }]);
	assert.deepEqual(first.open, [openRecord(defect)]);

	const second = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			{ ...capped, answers: { "fix-rounds": 1 } },
			agents(reports),
		),
	);

	assert.equal(second.at, "fixRounds");
	assert.equal(second.stop, 1);
	assert.equal(second.round, 2);
	assert.deepEqual(second.fixRounds, [{ id: "fix-rounds-2" }]);

	const clean = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			{ ...capped, answers: { "fix-rounds": 1, "fix-rounds-2": 2 } },
			agents(reports),
		),
	);

	assert.equal(clean.status, "clean");
	assert.equal(clean.rounds?.length, 3);
});

test("a zero answer at the round cap ends the fixing and lands the run", async () => {
	const defect = finding();
	const launched: string[] = [];
	const run = agents({ review: reviewed({ findings: [defect] }) });
	const result = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			{ ...ARGS, fixRounds: 0, answers: { "fix-rounds": 0 } },
			async (prompt, options) => {
				launched.push(options.agentType);
				return run(prompt, options);
			},
		),
	);

	assert.deepEqual(launched, ["den:reviewer", "den:comment-reviewer"]);
	assert.equal(result.status, "capped");
	// No round ran, so the comment pass read the tree as the review left it.
	assert.deepEqual(result.rounds, []);
	assert.deepEqual(result.comment, commented());
	// A capped return carries each finding whole: the user decides one by one
	// what becomes of the test the reviewer left in the tree for it.
	assert.deepEqual(result.open, [defect]);
	assert.equal(result.removal, undefined);
	assert.deepEqual(result.carried, EMPTY_CARRIED);
	// The host cuts a long return at its tail, so the roster every stop prints
	// again comes last.
	assert.deepEqual(Object.keys(result), [
		"status",
		"comment",
		"carried",
		"rounds",
		"open",
	]);
});

test("a capped run carries the findings whose tests are still in the tree", async () => {
	const decision = finding({ kind: "decision", tier: "opus" });
	const { prompts, result } = await record(
		{
			...ARGS,
			fixRounds: 0,
			answers: { [decision.id]: { action: "skip" }, "fix-rounds": 0 },
		},
		{ review: reviewed({ findings: [decision] }) },
	);

	assert.equal(result.status, "capped");
	assert.deepEqual(result.open, []);
	assert.deepEqual(result.removal, [decision]);
	assert.equal(prompts.length, 2);
});

test("a capped run with a ruled-skip finding includes removal in the stopped return at fixRounds", async () => {
	const decision = finding({ kind: "decision", tier: "opus" });
	const result = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			{
				...ARGS,
				fixRounds: 0,
				answers: { [decision.id]: { action: "skip" } },
			},
			agents({ review: reviewed({ findings: [decision] }) }),
		),
	);

	assert.equal(result.at, "fixRounds");
	assert.equal(result.status, "stopped");
	assert.equal(result.round, 0);
	assert.deepEqual(result.removal, [openRecord(decision)]);
});

test("the review stop says which findings a fixer takes up whatever the lead rules", async () => {
	const decision = finding({
		id: "stored-field",
		kind: "decision",
		tier: "opus",
	});
	const defect = finding();
	const old = finding({ id: "older-guard", preExisting: true });
	const result = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			ARGS,
			agents({ review: reviewed({ findings: [decision, defect, old] }) }),
		),
	);

	assert.equal(result.at, "review");
	// The decision waits on the lead's ruling and the pre-existing finding is
	// carried, so neither is what a fixer takes up.
	assert.deepEqual(result.open, [openRecord(defect)]);
	assert.equal(result.removal, undefined);
	// The lead rules on a decision by the scenario and the evidence the reviewer
	// wrote, so a held item arrives whole.
	assert.deepEqual(result.decisions, [decision]);
	assert.deepEqual(result.carried["preExisting"], [old]);
	// The host cuts a long return at its tail, so the items this stop holds and
	// the declarations the lead triages stand ahead of the roster.
	assert.deepEqual(Object.keys(result), [
		"status",
		"stop",
		"at",
		"decisions",
		"questions",
		"carried",
		"rounds",
		"open",
	]);
});

test("the fix stop says what the round still has open", async () => {
	const mechanical = finding();
	const judged = finding({ id: "flag-name", tier: "opus" });
	const result = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			ARGS,
			agents({
				review: reviewed({ findings: [mechanical, judged] }),
				fix: (_prompt, type) =>
					type === "den:implementer-opus"
						? fixed({ questions: [question(1, { finding: judged.id })] })
						: fixed(),
			}),
		),
	);

	assert.equal(result.at, "fix");
	// The stop's question names the second finding, which the lead answers
	// against its scenario and evidence, so that one stays whole.
	assert.deepEqual(result.open, [openRecord(mechanical), judged]);
	assert.equal(result.removal, undefined);
});

test("a fix stop reached mid-round on a removal finding includes that finding", async () => {
	const skipped = finding({ kind: "decision", tier: "opus" });
	const result = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			{
				...ARGS,
				answers: { [skipped.id]: { action: "skip" } },
			},
			agents({
				review: reviewed({ findings: [skipped] }),
				fix: (_prompt, type) => {
					if (type === "den:implementer-haiku") {
						return fixed({ questions: [question(1, { finding: skipped.id })] });
					}
					return fixed({ questions: [question(2, { finding: skipped.id })] });
				},
			}),
		),
	);

	assert.equal(result.at, "fix");
	assert.deepEqual(result.open, []);
	assert.deepEqual(result.removal, [skipped]);
});

test("the contested stop says what the round has open beside what it contested", async () => {
	const kept = finding({ id: "flag-name", tier: "opus" });
	const blocked = finding({ tier: "opus" });
	const contested = {
		finding: blocked.id,
		decision: "The loader owns the guard",
		reason: "The repair moves it to the caller.",
	};
	const result = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			ARGS,
			agents({
				review: reviewed({ findings: [kept, blocked] }),
				fix: () => fixed({ contested: [contested] }),
			}),
		),
	);

	assert.equal(result.at, "contested");
	// A contested finding comes back only when the lead rules fix.
	assert.deepEqual(result.open, [openRecord(kept)]);
	assert.equal(result.removal, undefined);
	assert.deepEqual(result.fixes, [
		fixRecord("opus", fixed({ contested: [contested] })),
	]);
});

test("the fix stop leaves out a finding the round already contested", async () => {
	const blocked = finding();
	const asking = finding({ id: "flag-name", tier: "opus" });
	const result = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			ARGS,
			agents({
				review: reviewed({ findings: [blocked, asking] }),
				fix: (_prompt, type) =>
					type === "den:implementer-haiku"
						? fixed({
								contested: [
									{
										finding: blocked.id,
										decision: "The loader owns the guard",
										reason: "The repair moves it to the caller.",
									},
								],
							})
						: fixed({ questions: [question(1, { finding: asking.id })] }),
			}),
		),
	);

	assert.equal(result.at, "fix");
	// The contested finding comes back at the contested stop, which this one
	// precedes.
	assert.deepEqual(result.open, [asking]);
});

test("the closure stop says what the next round takes up whatever the lead rules", async () => {
	const reopened = finding({ id: "flag-name" });
	const undecided = finding({ tier: "opus" });
	const opened = finding({
		id: "cache-path",
		title: "Guard the cache path",
		tier: "opus",
	});
	const result = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			ARGS,
			agents({
				review: reviewed({ findings: [reopened, undecided] }),
				close: () =>
					closed({
						verdicts: [
							verdict(reopened.id, "REOPENED"),
							verdict(undecided.id, "NEEDS-DECISION"),
						],
						opened: [opened],
					}),
			}),
		),
	);

	assert.equal(result.at, "closure");
	// The undecided finding comes back only when the lead rules fix. The
	// reopened one is listed at the tier that will take it.
	assert.deepEqual(result.open, [
		openRecord({ ...reopened, tier: "opus" }),
		openRecord(opened),
	]);
	assert.equal(result.removal, undefined);
});

test("a contested finding the lead ruled on reaches that round's closure stop, open or waiting removal", async () => {
	const undecided = finding({ id: "flag-name", tier: "opus" });
	const blocked = finding({ tier: "opus" });
	const contested = {
		finding: blocked.id,
		decision: "The loader owns the guard",
		reason: "The repair moves it to the caller.",
	};
	const reports: Reports = {
		review: reviewed({ findings: [undecided, blocked] }),
		fix: () => fixed({ contested: [contested] }),
		close: () =>
			closed({ verdicts: [verdict(undecided.id, "NEEDS-DECISION")] }),
	};
	const instruction = "Guard it in the caller.";

	const fixing = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			{ ...ARGS, answers: { [blocked.id]: { action: "fix", instruction } } },
			agents(reports),
		),
	);

	assert.equal(fixing.at, "closure");
	// The instruction is the lead's own words, so the narrowed record drops it.
	assert.deepEqual(fixing.open, [openRecord(blocked)]);
	assert.equal(fixing.removal, undefined);

	const skipping = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			{ ...ARGS, answers: { [blocked.id]: { action: "skip" } } },
			agents(reports),
		),
	);

	assert.equal(skipping.at, "closure");
	assert.deepEqual(skipping.open, []);
	assert.deepEqual(skipping.removal, [openRecord(blocked)]);
});

test("a contested finding from either fixer stops the run, leaves that round's closure, and comes back when the lead rules fix", async () => {
	for (const tier of ["haiku", "opus"]) {
		const defect = finding({ tier });
		const contested = {
			finding: defect.id,
			decision: "The loader owns the guard",
			reason: "The repair moves it to the caller.",
		};
		const closures: string[] = [];
		const briefs: string[] = [];
		const reports: Reports = {
			review: reviewed({ findings: [defect] }),
			fix: (prompt, _type, launch) => {
				briefs.push(prompt);
				return launch === 1 ? fixed({ contested: [contested] }) : fixed();
			},
			close: (prompt) => {
				closures.push(prompt);
				return closing(prompt);
			},
		};

		const stopped = outcome(
			await runWorkflow("review-and-fix-workflow", ARGS, agents(reports)),
		);

		assert.equal(stopped.at, "contested");
		assert.equal(stopped.round, 1);
		assert.deepEqual(stopped.contested, [{ ...contested, finding: defect }]);
		assert.equal(closures.length, 0);

		briefs.length = 0;
		closures.length = 0;
		const clean = outcome(
			await runWorkflow(
				"review-and-fix-workflow",
				{
					...ARGS,
					answers: {
						"empty-path": {
							action: "fix",
							instruction: "Keep it in the loader.",
						},
					},
				},
				agents(reports),
			),
		);

		assert.equal(clean.status, "clean");
		// Nothing was open once the finding left, so that round asked no verifier
		// to judge a fix nobody made; the next round's closure has it back.
		assert.equal(closures.length, 1);
		assert.deepEqual(
			openIn(closures[0] ?? "").map((item) => item["id"]),
			[defect.id],
		);
		assert.deepEqual(findingsIn(briefs[1] ?? ""), [
			{ ...defect, instruction: "Keep it in the loader." },
		]);
	}
});

test("a contested finding ruled skip leaves the tree without an instruction", async () => {
	for (const tier of ["haiku", "opus"]) {
		const defect = finding({ tier });
		const contested = {
			finding: defect.id,
			decision: "The loader owns the guard",
			reason: "The repair moves it to the caller.",
		};
		const briefs: string[] = [];
		const reports: Reports = {
			review: reviewed({ findings: [defect] }),
			fix: (prompt, _type, launch) => {
				briefs.push(prompt);
				return launch === 1 ? fixed({ contested: [contested] }) : fixed();
			},
			close: (prompt) => closing(prompt),
		};

		const stopped = outcome(
			await runWorkflow("review-and-fix-workflow", ARGS, agents(reports)),
		);

		assert.equal(stopped.at, "contested");

		briefs.length = 0;
		const clean = outcome(
			await runWorkflow(
				"review-and-fix-workflow",
				{
					...ARGS,
					answers: {
						"empty-path": { action: "skip" },
					},
				},
				agents(reports),
			),
		);

		assert.equal(clean.status, "clean");
		assert.deepEqual(removalIn(briefs[1] ?? "").findings, [defect]);
	}
});

test("a contested restructure item ruled skip is dropped with nothing in removal", async () => {
	const haikus: Launch[] = [];
	const opuses: Launch[] = [];
	const instruction = "Move the guard into the loader.";

	function restructureContestRun(
		haikuLaunches: Launch[],
		opusLaunches: Launch[],
	): Reports {
		return {
			review: reviewed({ findings: [finding()] }),
			fix: (prompt, type) => {
				if (type === "den:implementer-haiku") {
					haikuLaunches.push({ type, prompt });
				} else {
					opusLaunches.push({ type, prompt });
				}
				return type === "den:implementer-opus"
					? fixed({
							contested: [
								{
									finding: "guard-shape",
									decision: "The restructure is not required",
									reason: "The fixes already separate the concerns",
								},
							],
						})
					: fixed();
			},
			close: (prompt, round) =>
				round === 1
					? closed({
							verdicts: [verdict("empty-path")],
							restructure: [restructured()],
						})
					: closing(prompt),
		};
	}

	// Ruled fix, the restructure item becomes a finding, which the Opus fixer
	// contests.
	const stopped = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			{ ...ARGS, answers: { "guard-shape": { action: "fix", instruction } } },
			agents(restructureContestRun(haikus, opuses)),
		),
	);

	assert.equal(stopped.at, "contested");
	// The closure stop consumed the item's id, so the contested stop holds it
	// under the id a rename gave it.
	const held = (
		stopped as unknown as { contested: { finding: { id: string } }[] }
	).contested[0]?.finding.id;
	assert.ok(held);

	haikus.length = 0;
	opuses.length = 0;
	const clean = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			{
				...ARGS,
				answers: {
					"guard-shape": { action: "fix", instruction },
					[held]: { action: "skip" },
				},
			},
			agents(restructureContestRun(haikus, opuses)),
		),
	);

	assert.equal(clean.status, "clean");
	// A restructure item has no test in the tree, so the skip queues no removal
	// round: round one's haiku fixer and round two's Opus fixer are the only
	// launches.
	assert.deepEqual(
		haikus.map((launch) => launch.type),
		["den:implementer-haiku"],
	);
	assert.deepEqual(
		opuses.map((launch) => launch.type),
		["den:implementer-opus"],
	);
});

test("a contested finding ruled fix carries the instruction that settles the decision", async () => {
	const defect = finding({ tier: "opus" });
	const contested = {
		finding: defect.id,
		decision: "The loader owns the guard",
		reason: "The repair moves it to the caller.",
	};

	await assert.rejects(
		runWorkflow(
			"review-and-fix-workflow",
			{ ...ARGS, answers: { "empty-path": { action: "fix" } } },
			agents({
				review: reviewed({ findings: [defect] }),
				fix: (_prompt, _type, launch) =>
					launch === 1 ? fixed({ contested: [contested] }) : fixed(),
			}),
		),
		/empty-path.*instruction/s,
	);
});

const REVERT = "Revert the guard; the loader stays as it was.";

test("a finding the closure could not decide is ruled fix, with the instruction that says what becomes of the edit", async () => {
	const defect = finding({ tier: "opus" });
	const briefs: Record<string, unknown>[][] = [];
	const closures: string[] = [];
	const reports: Reports = {
		review: reviewed({ findings: [defect] }),
		fix: (prompt) => {
			briefs.push(findingsIn(prompt));
			return fixed();
		},
		close: (prompt, round) => {
			closures.push(prompt);
			return round === 1
				? closed({
						verdicts: [
							{
								id: defect.id,
								verdict: "NEEDS-DECISION",
								reason: "The stored format is not settled.",
							},
						],
					})
				: closing(prompt);
		},
	};

	await assert.rejects(
		runWorkflow(
			"review-and-fix-workflow",
			{ ...ARGS, answers: { "empty-path": { action: "fix" } } },
			agents(reports),
		),
		/empty-path.*instruction/s,
	);

	briefs.length = 0;
	closures.length = 0;
	const clean = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			{
				...ARGS,
				answers: { "empty-path": { action: "fix", instruction: REVERT } },
			},
			agents(reports),
		),
	);

	// Taking the round's edit back out is a fix like any other: the finding
	// reaches the next fixer under its own id with the instruction, and that
	// round's closure pass judges what the fixer did with it.
	assert.equal(clean.status, "clean");
	assert.deepEqual(briefs[1], [{ ...defect, instruction: REVERT }]);
	assert.deepEqual(
		openIn(closures[1] ?? "").map((item) => item["id"]),
		[defect.id],
	);
});

test("a finding the closure could not decide is not dropped by a ruling of skip", async () => {
	const defect = finding({ tier: "opus" });

	// A fixer worked this finding before the verifier held it, so the ruling
	// says what becomes of that edit instead of dropping the finding.
	await assert.rejects(
		runWorkflow(
			"review-and-fix-workflow",
			{ ...ARGS, answers: { "empty-path": { action: "skip" } } },
			agents({
				review: reviewed({ findings: [defect] }),
				close: (prompt, round) =>
					round === 1
						? closed({
								verdicts: [
									{
										id: defect.id,
										verdict: "NEEDS-DECISION",
										reason: "The stored format is not settled.",
									},
								],
							})
						: closing(prompt),
			}),
		),
		/empty-path.*what becomes of the edit/s,
	);
});

test("a decision the closure opens is ruled on as the reviewer's are, its instruction optional", async () => {
	const defect = finding({ tier: "opus" });
	const opened = finding({
		id: "stored-format",
		kind: "decision",
		title: "Store the path as text",
		tier: "opus",
	});
	const briefs: Record<string, unknown>[][] = [];
	const clean = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			{ ...ARGS, answers: { "stored-format": { action: "fix" } } },
			agents({
				review: reviewed({ findings: [defect] }),
				fix: (prompt) => {
					briefs.push(findingsIn(prompt));
					return fixed();
				},
				close: (prompt, round) =>
					round === 1 ? closing(prompt, { opened: [opened] }) : closing(prompt),
			}),
		),
	);

	// No fixer has read a finding the verifier opened, so its own repair is what
	// the next round runs on, as at the review stop.
	assert.equal(clean.status, "clean");
	assert.deepEqual(briefs[1], [opened]);
});

test("a decision the closure opens is ruled skip without an instruction and leaves the tree", async () => {
	const defect = finding({ tier: "opus" });
	const opened = finding({
		id: "stored-format",
		kind: "decision",
		title: "Store the path as text",
		tier: "opus",
	});
	let firstRound = true;
	const briefs: string[] = [];
	const reports: Reports = {
		review: reviewed({ findings: [defect] }),
		fix: (prompt) => {
			briefs.push(prompt);
			return fixed();
		},
		close: (prompt, round) => {
			const result =
				firstRound && round === 1
					? closing(prompt, { opened: [opened] })
					: closing(prompt);
			if (round === 1) firstRound = false;
			return result;
		},
	};
	const result = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			{ ...ARGS, answers: { "stored-format": { action: "skip" } } },
			agents(reports),
		),
	);

	assert.equal(result.status, "clean");
	assert.deepEqual(removalIn(briefs[1] ?? "").findings, [opened]);
});

test("a finding the closure cannot decide stops the run with the reason it gave", async () => {
	const defect = finding();
	const reason = "The stored format is not settled.";
	const reports: Reports = {
		review: reviewed({ findings: [defect] }),
		close: (prompt, round) =>
			round === 1
				? closed({
						verdicts: [{ id: defect.id, verdict: "NEEDS-DECISION", reason }],
					})
				: closing(prompt),
	};

	const stopped = outcome(
		await runWorkflow("review-and-fix-workflow", ARGS, agents(reports)),
	);

	assert.equal(stopped.at, "closure");
	assert.equal(stopped.round, 1);
	assert.deepEqual(stopped.undecided, [{ ...defect, reason }]);

	const clean = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			{
				...ARGS,
				answers: { "empty-path": { action: "fix", instruction: REVERT } },
			},
			agents(reports),
		),
	);

	assert.equal(clean.status, "clean");
	assert.equal(clean.rounds?.length, 2);
});

test("a finding the closure cannot decide, whose id the lead already ruled on, stops under the id the answer must come under", async () => {
	const reason = "The stored format is not settled.";
	// A run renames the ids in the reports it was handed, and the host replays a
	// resumed run from the cached report, so each run is given its own.
	const reports = (): Reports => ({
		review: reviewed({
			findings: [
				finding({ id: "stored-format", kind: "decision", tier: "opus" }),
			],
		}),
		close: (prompt, round) =>
			round === 1
				? closed({
						verdicts: [
							{ id: "stored-format", verdict: "NEEDS-DECISION", reason },
						],
					})
				: closing(prompt),
	});
	const ruled = { "stored-format": { action: "fix" } };

	const stopped = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			{ ...ARGS, answers: ruled },
			agents(reports()),
		),
	);

	assert.equal(stopped.at, "closure");
	// The review stop consumed `stored-format`, so this stop asks under the
	// renamed id, and the return has to name it or the lead answers a key
	// that is already taken.
	assert.deepEqual(
		stopped.undecided?.map((item) => (item as { id: string }).id),
		["stored-format-2"],
	);

	const clean = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			{
				...ARGS,
				answers: {
					...ruled,
					"stored-format-2": {
						action: "fix",
						instruction: "Revert the stored field.",
					},
				},
			},
			agents(reports()),
		),
	);

	assert.equal(clean.status, "clean");
});

test("a decision finding the closure opens stops the run before a fixer takes it", async () => {
	const defect = finding({ tier: "opus" });
	const opened = finding({
		id: "stored-format",
		kind: "decision",
		title: "Store the path as text",
		tier: "opus",
	});
	const briefs: Record<string, unknown>[][] = [];
	const result = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			ARGS,
			agents({
				review: reviewed({ findings: [defect] }),
				fix: (prompt) => {
					briefs.push(findingsIn(prompt));
					return fixed();
				},
				close: (prompt, round) =>
					round === 1 ? closing(prompt, { opened: [opened] }) : closing(prompt),
			}),
		),
	);

	assert.equal(result.status, "stopped");
	assert.equal(briefs.length, 1);
});

test("a pre-existing finding the closure opens is carried, not sent to a fixer", async () => {
	const defect = finding({ tier: "opus" });
	const old = finding({
		id: "older-guard",
		title: "Fix the older guard",
		preExisting: true,
		tier: "opus",
	});
	const briefs: Record<string, unknown>[][] = [];
	const result = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			ARGS,
			agents({
				review: reviewed({ findings: [defect] }),
				fix: (prompt) => {
					briefs.push(findingsIn(prompt));
					return fixed();
				},
				close: (prompt, round) =>
					round === 1 ? closing(prompt, { opened: [old] }) : closing(prompt),
			}),
		),
	);

	assert.equal(result.status, "clean");
	assert.equal(result.rounds?.length, 1);
	assert.deepEqual(briefs, [[defect]]);
	assert.deepEqual(result.carried["preExisting"], [old]);
});

test("one closure stop holds the restructure items, the undecided findings and the decisions the closure opened", async () => {
	const defect = finding({ tier: "opus" });
	const opened = finding({
		id: "stored-format",
		kind: "decision",
		title: "Store the path as text",
		tier: "opus",
	});
	const item = restructured();
	const reason = "The stored format is not settled.";
	const stopped = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			ARGS,
			agents({
				review: reviewed({ findings: [defect] }),
				close: () =>
					closed({
						verdicts: [{ id: defect.id, verdict: "NEEDS-DECISION", reason }],
						opened: [opened],
						restructure: [item],
					}),
			}),
		),
	);

	assert.equal(stopped.at, "closure");
	assert.equal(stopped.stop, 0);
	assert.deepEqual(stopped.restructure, [item]);
	assert.deepEqual(stopped.undecided, [{ ...defect, reason }]);
	assert.deepEqual(stopped.decisions, [opened]);
});

test("every restructure item is ruled under its own id, and each ruled fix enters the next round as its own finding, with its instruction where one is given", async () => {
	const defect = finding({ tier: "opus" });
	const second = restructured({
		id: "guard-home",
		units: "lib/cache.mjs",
		path: "lib/cache.mjs",
		line: 8,
	});
	// A stop that held only one item would leave the other's answer unused, which
	// fails the run.
	const { prompts, result } = await record(
		{
			...ARGS,
			answers: {
				"guard-shape": {
					action: "fix",
					instruction: "Move the guard into the loader.",
				},
				"guard-home": { action: "fix" },
			},
		},
		{
			review: reviewed({ findings: [defect] }),
			close: (prompt, round) =>
				round === 1
					? closed({
							verdicts: [verdict(defect.id, "REOPENED")],
							restructure: [restructured(), second],
						})
					: closing(prompt),
		},
	);

	assert.equal(result.status, "clean");
	// The review, round one's fixer and its closure, then round two's fixer.
	assert.deepEqual(
		findingsIn(prompts[3] ?? "").map((taken) => [
			taken["id"],
			taken["path"],
			taken["instruction"],
		]),
		[
			[defect.id, defect.path, undefined],
			["guard-shape", "lib/loader.mjs", "Move the guard into the loader."],
			["guard-home", "lib/cache.mjs", undefined],
		],
	);
});

test("an Opus fixer's questions stop the run with what it built, and a fresh fixer continues from its report", async () => {
	const judged = finding({ id: "flag-name", tier: "opus" });
	const raised = question(1, { finding: judged.id });
	const stopper = fixed({
		questions: [raised],
		built: "The flag moved; the guard did not.",
	});
	const reports: Reports = {
		review: reviewed({ findings: [judged] }),
		fix: (_prompt, _type, launch) => (launch === 1 ? stopper : fixed()),
	};

	const stopped = outcome(
		await runWorkflow("review-and-fix-workflow", ARGS, agents(reports)),
	);

	assert.equal(stopped.at, "fix");
	assert.equal(stopped.round, 1);
	assert.deepEqual(stopped.questions, [raised]);
	// A round is recorded when it ends, so a stop inside the first one carries
	// no round; the fixer that asked reaches the lead under `fixes`.
	assert.equal(stopped.built, undefined);
	assert.equal(stopped.verification, undefined);
	assert.deepEqual(stopped.rounds, []);
	assert.deepEqual(stopped.fixes, [fixRecord("opus", stopper)]);

	const { prompts, result } = await record(
		{ ...ARGS, answers: { "guard-1": "The loader owns it" } },
		reports,
	);
	const continuation = prompts[2] ?? "";
	const { questions: _asked, ...state } = stopper;

	assert.equal(result.status, "clean");
	assert.ok(continuation.startsWith(prompts[1] ?? "missing brief"));
	assert.deepEqual(stateIn(continuation), state);
	assert.deepEqual(threadIn(continuation), [
		{ ...raised, answer: "The loader owns it" },
	]);
});

test("a closure that leaves a finding without a verdict, or judges one the round was not fixing, fails at its stage", async () => {
	const defect = finding();
	const wrong = [
		[],
		[verdict("cache-path")],
		[verdict(defect.id), verdict("cache-path")],
	];

	for (const verdicts of wrong) {
		await assert.rejects(
			runWorkflow(
				"review-and-fix-workflow",
				ARGS,
				agents({
					review: reviewed({ findings: [defect] }),
					close: () => closed({ verdicts }),
				}),
			),
			/verdict/,
		);
	}
});

test("the comment reviewer runs on the scope alone, once nothing is open and no test waits removal", async () => {
	const decision = finding({ kind: "decision", tier: "opus" });
	const launched: string[] = [];
	const run = agents({ review: reviewed({ findings: [decision] }) });
	let scope = "";
	const result = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			{ ...ARGS, answers: { "empty-path": { action: "skip" } } },
			async (prompt, options) => {
				launched.push(options.agentType);
				if (options.agentType === "den:comment-reviewer") {
					scope = prompt;
				}
				return run(prompt, options);
			},
		),
	);

	assert.equal(result.status, "clean");
	// The removal is mechanical, so a round with nothing open still runs the
	// haiku fixer; a skip takes a test out and changes nothing else, so that
	// round leaves no fix for a verifier and the comment pass follows it.
	assert.deepEqual(launched, [
		"den:reviewer",
		"den:implementer-haiku",
		"den:comment-reviewer",
	]);
	assert.equal(scope, SCOPE);
});

test("a clean return carries every list the rounds filled and the account of what they did", async () => {
	const deviations = [
		{
			what: "Named the guard loadGuard",
			forcedBy: "The brief's name is taken",
			where: "lib/loader.mjs:8",
		},
	];
	const choices = [
		{
			chose: "The guard beside the loader's own tests",
			over: "A test file of its own",
		},
	];
	const unsure = [{ what: "The cache path", why: "No test covers it" }];
	const defect = finding();
	const report = fixed({ deviations, choices, unsure });
	const result = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			ARGS,
			agents({
				review: reviewed({ findings: [defect] }),
				fix: () => report,
			}),
		),
	);

	assert.equal(result.status, "clean");
	assert.deepEqual(result.carried, {
		...EMPTY_CARRIED,
		deviations,
		choices,
		unsure,
	});
	assert.deepEqual(result.rounds, [
		{
			round: 1,
			findings: [
				{
					id: defect.id,
					title: defect.title,
					path: defect.path,
					verdict: "CLOSED",
					reason: verdict(defect.id).reason,
				},
			],
			fixes: [verifiedRecord("haiku", report)],
		},
	]);
	assert.deepEqual(result.comment, commented());
	assert.deepEqual(Object.keys(result), [
		"status",
		"comment",
		"carried",
		"rounds",
	]);
});

test("a closure stop accounts for the round it has just judged", async () => {
	const defect = finding();
	const reason = "The stored format decides which guard is right.";
	const report = fixed();
	const stopped = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			ARGS,
			agents({
				review: reviewed({ findings: [defect] }),
				fix: () => report,
				close: () =>
					closed({
						verdicts: [{ id: defect.id, verdict: "NEEDS-DECISION", reason }],
					}),
			}),
		),
	);

	assert.equal(stopped.at, "closure");
	// The lead rules on the finding from the round that worked it, so a stop
	// carries the round it has just judged.
	assert.deepEqual(stopped.rounds, [
		{
			round: 1,
			findings: [
				{
					id: defect.id,
					title: defect.title,
					path: defect.path,
					verdict: "NEEDS-DECISION",
					reason,
				},
			],
			fixes: [verifiedRecord("haiku", report)],
		},
	]);
	// The comment pass runs once nothing is open, so a stop carries none.
	assert.equal(stopped.comment, undefined);
	assert.deepEqual(Object.keys(stopped), [
		"status",
		"stop",
		"at",
		"restructure",
		"undecided",
		"decisions",
		"round",
		"carried",
		"rounds",
		"open",
	]);
});

test("a reviewer's question that changes no code, and a pre-existing decision finding, are carried without a stop", async () => {
	const host = asked({ id: "host-version", changesCode: false });
	const old = finding({ kind: "decision", preExisting: true });
	const result = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			ARGS,
			agents({ review: reviewed({ findings: [old], questions: [host] }) }),
		),
	);

	assert.equal(result.status, "clean");
	assert.equal(result.rounds?.length, 0);
	assert.deepEqual(result.carried["asides"], [{ stage: "review", ...host }]);
	assert.deepEqual(result.carried["preExisting"], [old]);
});

test("adding an answer leaves every prompt before that stop untouched", async () => {
	const decision = finding({
		id: "stored-field",
		kind: "decision",
		tier: "opus",
	});
	const reports: Reports = {
		review: reviewed({ findings: [decision] }),
		fix: (_prompt, _type, launch) =>
			launch === 1
				? fixed({ questions: [question(1, { finding: "stored-field" })] })
				: fixed(),
	};

	const first = await record(ARGS, reports);
	const second = await record(
		{ ...ARGS, answers: { "stored-field": { action: "fix" } } },
		reports,
	);
	const third = await record(
		{
			...ARGS,
			answers: {
				"stored-field": { action: "fix" },
				"guard-1": "The loader owns it",
			},
		},
		reports,
	);

	assert.deepEqual(
		[first.prompts.length, second.prompts.length, third.prompts.length],
		[1, 2, 5],
	);
	assert.deepEqual(first.prompts, third.prompts.slice(0, 1));
	assert.deepEqual(second.prompts, third.prompts.slice(0, 2));
});

test("a stop answered in part is rejected at the stop", async () => {
	await assert.rejects(
		runWorkflow(
			"review-and-fix-workflow",
			{ ...ARGS, answers: { "stored-field": { action: "fix" } } },
			agents({
				review: reviewed({
					findings: [finding({ id: "stored-field", kind: "decision" })],
					questions: [asked()],
				}),
			}),
		),
		/answered whole/,
	);
});

test("an answer no stop asked for ends the run", async () => {
	await assert.rejects(
		runWorkflow(
			"review-and-fix-workflow",
			{ ...ARGS, answers: { "guard-9": "For a question nobody raised" } },
			agents(),
		),
		/guard-9/,
	);
});

test("a report that gives one id to two items is rejected at its stage", async () => {
	const defect = finding();
	const reports: readonly Reports[] = [
		{ review: reviewed({ findings: [finding(), finding()] }) },
		{
			review: reviewed({
				findings: [finding({ id: "flag-owner" })],
				questions: [asked()],
			}),
		},
		{
			review: reviewed({ findings: [defect] }),
			fix: () => fixed({ questions: [question(1), question(1)] }),
		},
		{
			review: reviewed({ findings: [defect] }),
			close: () =>
				closed({ verdicts: [verdict(defect.id), verdict(defect.id)] }),
		},
		{
			review: reviewed({ findings: [defect] }),
			close: (prompt) =>
				closing(prompt, {
					opened: [
						finding({ id: "cache-path" }),
						finding({ id: "cache-path", title: "Name the cache key" }),
					],
				}),
		},
	];

	for (const report of reports) {
		await assert.rejects(
			runWorkflow("review-and-fix-workflow", ARGS, agents(report)),
			/to more than one item/,
		);
	}
});

test("a fixer's question or contested item naming a finding its brief did not carry reaches the lead, and the round goes on", async () => {
	const defect = finding();
	// A fixer reads the ids of earlier rounds' findings in the rulings, so an id
	// it echoes from there reaches no route of this run.
	const stray = question(1, { finding: "cache-path" });
	const blocked = {
		finding: "cache-path",
		decision: "The loader owns the guard",
		reason: "The repair moves it.",
	};
	const { prompts, result } = await record(ARGS, {
		review: reviewed({ findings: [defect] }),
		fix: (_prompt, _type, launch) =>
			launch === 1
				? fixed({ questions: [stray], contested: [blocked] })
				: fixed(),
	});

	assert.equal(result.status, "clean");
	assert.deepEqual(result.carried["asides"], [
		{ stage: "fix:1:haiku", ...stray },
		{ stage: "fix:1:haiku", ...blocked },
	]);
	// Four launches: the reviewer, the haiku fixer, the closure pass and the
	// comment pass. Nothing was escalated, contested or stopped on, and the
	// round closed the finding it was given.
	assert.equal(prompts.length, 4);
});

test("a question about no finding reaches the lead at the fix stop, and the haiku tier's is carried", async () => {
	const defect = finding({ tier: "opus" });
	const whole = question(1, { finding: undefined });

	const stopped = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			ARGS,
			agents({
				review: reviewed({ findings: [defect] }),
				fix: (_prompt, _type, launch) =>
					launch === 1 ? fixed({ questions: [whole] }) : fixed(),
			}),
		),
	);

	assert.equal(stopped.at, "fix");
	assert.deepEqual(stopped.questions, [whole]);
	assert.deepEqual(stopped.carried["asides"], []);

	// A haiku question moves the finding it names to the round's Opus fixer, so
	// one naming no finding has no reader but the lead.
	const carried = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			ARGS,
			agents({
				review: reviewed({ findings: [finding()] }),
				fix: (_prompt, _type, launch) =>
					launch === 1 ? fixed({ questions: [whole] }) : fixed(),
			}),
		),
	);

	assert.equal(carried.status, "clean");
	assert.deepEqual(carried.carried["asides"], [
		{ stage: "fix:1:haiku", ...whole },
	]);
});

test("an answer of the wrong shape for what it answers fails at the stop", async () => {
	await assert.rejects(
		runWorkflow(
			"review-and-fix-workflow",
			{ ...ARGS, answers: { "flag-owner": { action: "fix" } } },
			agents({ review: reviewed({ questions: [asked()] }) }),
		),
		/flag-owner is answered in nonempty text/,
	);

	const rulings: readonly unknown[] = [
		"just fix it",
		{ action: "maybe" },
		{ action: "skip", why: "later" },
		{ action: "fix", instruction: 7 },
	];
	for (const answer of rulings) {
		await assert.rejects(
			runWorkflow(
				"review-and-fix-workflow",
				{ ...ARGS, answers: { "stored-field": answer } },
				agents({
					review: reviewed({
						findings: [finding({ id: "stored-field", kind: "decision" })],
					}),
				}),
			),
			/stored-field is a finding/,
		);
	}

	const counts: readonly unknown[] = [-1, 1.5, "three", { action: "fix" }];
	for (const answer of counts) {
		await assert.rejects(
			runWorkflow(
				"review-and-fix-workflow",
				{ ...ARGS, fixRounds: 0, answers: { "fix-rounds": answer } },
				agents({ review: reviewed({ findings: [finding()] }) }),
			),
			/fix-rounds is how many more/,
		);
	}
});

test("an agent that returns nothing usable ends the run at its own stage", async () => {
	const missing = [
		"den:reviewer",
		"den:implementer-haiku",
		"den:closure-verifier",
		"den:comment-reviewer",
	];

	for (const stage of missing) {
		const run = agents({ review: reviewed({ findings: [finding()] }) });
		await assert.rejects(
			runWorkflow("review-and-fix-workflow", ARGS, async (prompt, options) =>
				options.agentType === stage ? null : run(prompt, options),
			),
			/no usable report/,
		);
	}
});

test("a question whose id is a property every object has still stops the run", async () => {
	const decision = finding({
		id: "stored-field",
		kind: "decision",
		tier: "opus",
	});
	const result = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			{ ...ARGS, answers: { "stored-field": { action: "fix" } } },
			agents({
				review: reviewed({ findings: [decision] }),
				fix: () =>
					fixed({
						questions: [
							question(1, { id: "constructor", finding: "stored-field" }),
						],
					}),
			}),
		),
	);

	assert.equal(result.status, "stopped");
	assert.equal(result.stop, 1);
	assert.equal(result.at, "fix");
});

test("a stopped return carries what the fixers declared before the stop, and the return after it is answered does not", async () => {
	const decision = finding({
		id: "stored-field",
		kind: "decision",
		tier: "opus",
	});
	const before = [
		{
			what: "Guarded the caller too",
			forcedBy: "The cache path reaches the loader twice",
			where: "lib/loader.mjs:12",
		},
	];
	const reports: Reports = {
		review: reviewed({ findings: [finding()] }),
		fix: (_prompt, _type, launch) =>
			launch === 1 ? fixed({ deviations: before }) : fixed(),
		close: (prompt, round) =>
			round === 1 ? closing(prompt, { opened: [decision] }) : closing(prompt),
	};

	const stopped = outcome(
		await runWorkflow("review-and-fix-workflow", ARGS, agents(reports)),
	);

	assert.equal(stopped.at, "closure");
	assert.deepEqual(stopped.carried, { ...EMPTY_CARRIED, deviations: before });

	const clean = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			{ ...ARGS, answers: { "stored-field": { action: "fix" } } },
			agents(reports),
		),
	);

	assert.equal(clean.status, "clean");
	assert.deepEqual(clean.carried, EMPTY_CARRIED);
	// An answered stop empties the declarations, not the account of the run, so
	// the round before the stop is still in the return that lands.
	assert.deepEqual(
		clean.rounds?.map((entry) => entry["round"]),
		[1, 2],
	);
	assert.deepEqual(clean.rounds?.[0]?.["fixes"], [
		verifiedRecord("haiku", fixed({ deviations: before })),
	]);
});

test("an answered stop empties what the lead triaged", async () => {
	const decision = finding({
		id: "stored-field",
		kind: "decision",
		tier: "opus",
	});
	const old = finding({ id: "older-guard", preExisting: true });
	const host = asked({ id: "host-version", changesCode: false });
	const since = [
		{
			what: "Left the flag where it was",
			forcedBy: "The answer names the loader",
			where: "lib/loader.mjs:20",
		},
	];
	const { result } = await record(
		{ ...ARGS, answers: { "stored-field": { action: "fix" } } },
		{
			review: reviewed({ findings: [decision, old], questions: [host] }),
			fix: () => fixed({ deviations: since }),
		},
	);

	// The lead triaged the review stop's lists in the return it answered, the
	// pre-existing finding and the aside among them.
	assert.deepEqual(result.carried, { ...EMPTY_CARRIED, deviations: since });
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
	)) as { designs: readonly { design: { contested: unknown } }[] };

	assert.ok(judged.includes('"decision": 1'), judged.slice(-200));
	for (const { design } of result.designs) {
		assert.deepEqual(design.contested, contested);
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
			/contested/,
		);
	}
});

test("a return past what the host shows logs its size per key and still returns", async () => {
	const logged: string[] = [];
	const decision = finding({
		id: "stored-field",
		kind: "decision",
		scenario: "x".repeat(9000),
	});
	const stopped = outcome(
		await runWorkflow(
			"review-and-fix-workflow",
			ARGS,
			agents({ review: reviewed({ findings: [decision] }) }),
			(message) => {
				logged.push(message);
			},
		),
	);

	assert.equal(stopped.at, "review");
	assert.equal(logged.length, 1);
	assert.match(logged[0] ?? "", /against the 8000/);
	assert.match(logged[0] ?? "", /decisions 9\d{3}/);

	// A return inside the budget logs nothing.
	await runWorkflow("review-and-fix-workflow", ARGS, agents({}), (message) => {
		logged.push(message);
	});
	assert.equal(logged.length, 1);
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
