import assert from "node:assert/strict";
import { test } from "node:test";
import {
	type Agent,
	noSuitableProposal,
	proposal,
	runWorkflow,
} from "./workflow-harness.mts";

const BASIS =
	"Confirmed: two independently maintained hosts (user). Assumption: a third host may follow.";

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
		"design-exploration",
		{ ask: "Add a host", decisions: "Retain the existing host", basis: BASIS },
		async (prompt, options) => {
			assert.ok(prompt.includes(BASIS));
			assert.ok(prompt.includes("Retain the existing host"));
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

test("design basis is required and invalid context is rejected before dispatch", async () => {
	for (const basis of [undefined, null, 7, "", " ", "x".repeat(6001)]) {
		await assert.rejects(
			runWorkflow(
				"design-exploration",
				{ ask: "Add a host", basis },
				async () => {
					assert.fail("invalid context must not launch an agent");
				},
			),
			/basis/,
		);
	}
});

test("a missing design result cannot become a smaller successful comparison", async () => {
	let index = 0;
	await assert.rejects(
		runWorkflow(
			"design-exploration",
			{ ask: "Add a host", basis: BASIS },
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
				"design-exploration",
				{ ask: "Add a host", basis: BASIS },
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
			"design-exploration",
			{ ask: "Add a host", basis: BASIS },
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
				"design-exploration",
				{ ask: "Add a host", basis: BASIS },
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

const ARGS = {
	goal: GOAL,
	plan: "docs/plans/loader.md",
	basis: "Confirmed: the loader owns the guard (user).",
	reviewer: "fable",
	fixRounds: 3,
};

const EMPTY_CARRIED = {
	deviations: [],
	choices: [],
	unsure: [],
	preExisting: [],
	asides: [],
	escalations: [],
};

interface Stage {
	readonly stage: string;
	readonly report: Record<string, unknown>;
}

interface Outcome {
	readonly status: string;
	readonly stop?: number;
	readonly at?: string;
	readonly round?: number;
	readonly rounds?: number;
	readonly built?: string;
	readonly verification?: string;
	readonly questions?: readonly unknown[];
	readonly decisions?: readonly unknown[];
	readonly contested?: readonly unknown[];
	readonly restructure?: readonly unknown[];
	readonly undecided?: readonly unknown[];
	readonly open?: readonly unknown[];
	readonly stages: readonly Stage[];
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
	mechanisms: "the cache path and the caller",
	patches: "round 1 guarded the caller, round 2 guarded the cache path",
	...over,
});

const commented = () => ({ report: "6 doc comments in scope, 4 rewritten." });

const FINDINGS = "which settles what the fix does.";
const SKIPPED = "The lead ruled these findings skip.";
const OPEN = "names it by:";
const ROUNDS =
	"The rounds before this one, each with the findings it fixed and the verdicts they ended in, and under `removed` the skipped findings whose tests it took out:";
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
		"review-and-fix",
		args,
		async (prompt, options) => {
			prompts.push(prompt);
			return run(prompt, options);
		},
	);

	return { prompts, result: outcome(result) };
}

test("invalid review-and-fix arguments are rejected before any agent launches", async () => {
	const rejected: readonly (readonly [Record<string, unknown>, RegExp])[] = [
		[{ ...ARGS, goal: "  " }, /goal/],
		[{ ...ARGS, goal: undefined }, /goal/],
		[{ ...ARGS, plan: 7 }, /plan/],
		[{ ...ARGS, basis: undefined }, /basis/],
		[{ ...ARGS, basis: "x".repeat(6001) }, /basis/],
		[{ ...ARGS, rulings: 7 }, /rulings/],
		[{ ...ARGS, rulings: "x".repeat(6001) }, /rulings/],
		[{ ...ARGS, decisions: "The loader owns the guard" }, /nothing else/],
		[{ ...ARGS, reviewer: "haiku" }, /reviewer/],
		[{ ...ARGS, reviewer: undefined }, /reviewer/],
		[{ ...ARGS, fixRounds: 1.5 }, /fixRounds/],
		[{ ...ARGS, fixRounds: undefined }, /fixRounds/],
		[{ ...ARGS, answers: [["The loader owns it"]] }, /answers/],
		[{ ...ARGS, answers: { "guard-1": null } }, /answers/],
		[{ ...ARGS, brief: "Move the guard into the loader." }, /nothing else/],
		[{ ...ARGS, implementer: "opus" }, /nothing else/],
		[{ ...ARGS, range: "HEAD~1" }, /nothing else/],
	];

	for (const [args, message] of rejected) {
		await assert.rejects(
			runWorkflow("review-and-fix", args, async () => {
				assert.fail("invalid arguments must not launch an agent");
			}),
			message,
		);
	}
});

test("the reviewer reads the working tree against HEAD, with the goal and the plan", async () => {
	const launched: {
		readonly type: string;
		readonly model: string | undefined;
	}[] = [];
	const run = agents();
	let scope = "";
	await runWorkflow(
		"review-and-fix",
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
		`Range: HEAD\n\nGoal: ${GOAL}\n\nPlan: docs/plans/loader.md`,
	);

	const bare = await record({ ...ARGS, plan: undefined });

	assert.equal(bare.prompts[0], `Range: HEAD\n\nGoal: ${GOAL}`);
});

test("the goal opens every fix brief and every closure launch", async () => {
	const openings: string[] = [];
	const keep = (prompt: string) => {
		openings.push(prompt);
		return undefined;
	};
	await runWorkflow(
		"review-and-fix",
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
		"review-and-fix",
		{ ...ARGS, rulings: settled },
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
		assert.ok(prompt.includes(settled), prompt.slice(0, 60));
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
		"review-and-fix",
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

test("a restructure item stops the round, and the lead's instruction reaches the next round's fix briefs", async () => {
	const defect = finding();
	const item = restructured();
	const instruction = "Move the guard into the loader.";
	const briefs: string[] = [];
	const reports: Reports = {
		review: reviewed({ findings: [defect] }),
		fix: (prompt) => {
			briefs.push(prompt);
			return fixed();
		},
		close: (prompt, round) => {
			if (round === 1) {
				return closed({
					verdicts: [verdict(defect.id, "REOPENED")],
					restructure: [item],
				});
			}
			return round === 2
				? closed({ verdicts: [verdict(defect.id, "REOPENED")] })
				: closing(prompt);
		},
	};

	const stopped = outcome(
		await runWorkflow("review-and-fix", ARGS, agents(reports)),
	);

	assert.equal(stopped.at, "closure");
	assert.equal(stopped.round, 1);
	assert.deepEqual(stopped.restructure, [item]);
	assert.equal(briefs.length, 1);

	briefs.length = 0;
	const clean = outcome(
		await runWorkflow(
			"review-and-fix",
			{ ...ARGS, answers: { "guard-shape": instruction } },
			agents(reports),
		),
	);

	assert.equal(clean.status, "clean");
	assert.equal(clean.rounds, 3);
	assert.ok(!briefs[0]?.includes(instruction));
	assert.ok(briefs[1]?.includes(instruction));
	// The instruction is the lead's answer to one round's fixes, and round three
	// was not that round.
	assert.ok(!briefs[2]?.includes(instruction));
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
			"review-and-fix",
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
			"review-and-fix",
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
	assert.equal(result.rounds, 2);
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
	assert.equal(result.rounds, 2);
	// Round one had nothing left open to judge, so it ran no closure pass, and
	// the test it took out reaches a verifier only in its record.
	assert.deepEqual(roundsIn(prompts[3] ?? ""), [
		{
			round: 1,
			findings: [],
			removed: [
				{ id: decision.id, title: decision.title, path: decision.path },
			],
		},
	]);
});

test("a haiku question about a test to take out hands it to the same round's Opus fixer", async () => {
	const decision = finding({
		id: "stored-field",
		kind: "decision",
		tier: "opus",
	});
	const launched: {
		readonly type: string;
		readonly removal: Record<string, unknown>[];
	}[] = [];
	const result = outcome(
		await runWorkflow(
			"review-and-fix",
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
	assert.deepEqual(result.carried["escalations"], [
		{
			id: decision.id,
			title: decision.title,
			path: decision.path,
			line: decision.line,
			reason: "question",
			round: 1,
		},
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
				"review-and-fix",
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
	// The review stop, the contested stop and the decision a closure pass
	// opened: every stop that rules on a finding no fixer has edited for.
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
	];

	for (const [answers, reports] of stops) {
		await assert.rejects(
			runWorkflow("review-and-fix", { ...ARGS, answers }, agents(reports)),
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
		"review-and-fix",
		ARGS,
		agents({ review: reviewed({ findings: [mechanical, judged] }), fix }),
	);

	assert.deepEqual(launched, [
		{ type: "den:implementer-haiku", findings: [mechanical] },
		{ type: "den:implementer-opus", findings: [judged] },
	]);

	launched.length = 0;
	await runWorkflow(
		"review-and-fix",
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
			"review-and-fix",
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
	assert.deepEqual(result.carried["escalations"], [
		{
			id: mechanical.id,
			title: mechanical.title,
			path: mechanical.path,
			line: mechanical.line,
			reason: "question",
			round: 1,
		},
	]);
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
			"review-and-fix",
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
	assert.equal(result.rounds, 2);
	assert.deepEqual(briefs[0], [defect]);
	// Reopening moved the finding off the tier that could not close it.
	assert.deepEqual(briefs[1], [{ ...defect, tier: "opus" }, opened]);
	assert.deepEqual(result.carried["escalations"], [
		{
			id: defect.id,
			title: defect.title,
			path: defect.path,
			line: defect.line,
			reason: "reopened",
			round: 1,
		},
	]);
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
		"review-and-fix",
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
			"review-and-fix",
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
		await runWorkflow("review-and-fix", capped, agents(reports)),
	);

	assert.equal(first.at, "fixRounds");
	assert.equal(first.stop, 0);
	assert.equal(first.round, 1);
	assert.deepEqual(first.open, [defect]);

	const second = outcome(
		await runWorkflow(
			"review-and-fix",
			{ ...capped, answers: { "fix-rounds": 1 } },
			agents(reports),
		),
	);

	assert.equal(second.at, "fixRounds");
	assert.equal(second.stop, 1);
	assert.equal(second.round, 2);

	const clean = outcome(
		await runWorkflow(
			"review-and-fix",
			{ ...capped, answers: { "fix-rounds": 1, "fix-rounds-2": 2 } },
			agents(reports),
		),
	);

	assert.equal(clean.status, "clean");
	assert.equal(clean.rounds, 3);
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
			await runWorkflow("review-and-fix", ARGS, agents(reports)),
		);

		assert.equal(stopped.at, "contested");
		assert.equal(stopped.round, 1);
		assert.deepEqual(stopped.contested, [{ ...contested, finding: defect }]);
		assert.equal(closures.length, 0);

		briefs.length = 0;
		closures.length = 0;
		const clean = outcome(
			await runWorkflow(
				"review-and-fix",
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
			await runWorkflow("review-and-fix", ARGS, agents(reports)),
		);

		assert.equal(stopped.at, "contested");

		briefs.length = 0;
		const clean = outcome(
			await runWorkflow(
				"review-and-fix",
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

test("a contested finding ruled fix carries the instruction that settles the decision", async () => {
	const defect = finding({ tier: "opus" });
	const contested = {
		finding: defect.id,
		decision: "The loader owns the guard",
		reason: "The repair moves it to the caller.",
	};

	await assert.rejects(
		runWorkflow(
			"review-and-fix",
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
			"review-and-fix",
			{ ...ARGS, answers: { "empty-path": { action: "fix" } } },
			agents(reports),
		),
		/empty-path.*instruction/s,
	);

	briefs.length = 0;
	closures.length = 0;
	const clean = outcome(
		await runWorkflow(
			"review-and-fix",
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
			"review-and-fix",
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
			"review-and-fix",
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
			"review-and-fix",
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
		await runWorkflow("review-and-fix", ARGS, agents(reports)),
	);

	assert.equal(stopped.at, "closure");
	assert.equal(stopped.round, 1);
	assert.deepEqual(stopped.undecided, [{ ...defect, reason }]);

	const clean = outcome(
		await runWorkflow(
			"review-and-fix",
			{
				...ARGS,
				answers: { "empty-path": { action: "fix", instruction: REVERT } },
			},
			agents(reports),
		),
	);

	assert.equal(clean.status, "clean");
	assert.equal(clean.rounds, 2);
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
			"review-and-fix",
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
			"review-and-fix",
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

test("a finding the haiku fixer handed to Opus is escalated once, not again when closure reopens the Opus fix", async () => {
	const mechanical = finding();
	const result = outcome(
		await runWorkflow(
			"review-and-fix",
			ARGS,
			agents({
				review: reviewed({ findings: [mechanical] }),
				fix: (_prompt, type) =>
					type === "den:implementer-haiku"
						? fixed({ questions: [question(1)] })
						: fixed(),
				close: (prompt, round) =>
					round === 1
						? closed({ verdicts: [verdict(mechanical.id, "REOPENED")] })
						: closing(prompt),
			}),
		),
	);

	assert.equal(result.status, "clean");
	assert.deepEqual(
		result.carried["escalations"]?.map(
			(item) => (item as { reason: string }).reason,
		),
		["question"],
	);
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
			"review-and-fix",
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
			"review-and-fix",
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
	assert.equal(result.rounds, 1);
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
			"review-and-fix",
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

test("every restructure item is answered under its own id, and each instruction reaches the next round", async () => {
	const defect = finding({ tier: "opus" });
	const first = restructured();
	const second = restructured({ id: "guard-home", units: "lib/cache.mjs" });
	const briefs: string[] = [];
	const reports: Reports = {
		review: reviewed({ findings: [defect] }),
		fix: (prompt) => {
			briefs.push(prompt);
			return fixed();
		},
		close: (prompt, round) =>
			round === 1
				? closed({
						verdicts: [verdict(defect.id, "REOPENED")],
						restructure: [first, second],
					})
				: closing(prompt),
	};

	const stopped = outcome(
		await runWorkflow("review-and-fix", ARGS, agents(reports)),
	);

	assert.equal(stopped.at, "closure");
	assert.deepEqual(stopped.restructure, [first, second]);

	briefs.length = 0;
	const clean = outcome(
		await runWorkflow(
			"review-and-fix",
			{
				...ARGS,
				answers: {
					"guard-shape": "Move the guard into the loader.",
					"guard-home": "Give the cache its own key.",
				},
			},
			agents(reports),
		),
	);

	assert.equal(clean.status, "clean");
	assert.ok(briefs[1]?.includes("Move the guard into the loader."));
	assert.ok(briefs[1]?.includes("Give the cache its own key."));
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
		await runWorkflow("review-and-fix", ARGS, agents(reports)),
	);

	assert.equal(stopped.at, "fix");
	assert.equal(stopped.round, 1);
	assert.deepEqual(stopped.questions, [raised]);
	assert.equal(stopped.built, "The flag moved; the guard did not.");
	assert.equal(stopped.verification, "14 tests, 0 failures.");

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
				"review-and-fix",
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
			"review-and-fix",
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
	assert.equal(scope, "Range: HEAD");
});

test("a clean return carries every list the rounds filled, with one stage entry per agent", async () => {
	const deviations = [
		{
			what: "Named the guard loadGuard",
			forcedBy: "The brief's name is taken",
			where: "lib/loader.mjs:8",
		},
	];
	const choices = ["Put the guard beside the loader's own tests"];
	const unsure = [{ what: "The cache path", why: "No test covers it" }];
	const result = outcome(
		await runWorkflow(
			"review-and-fix",
			ARGS,
			agents({
				review: reviewed({ findings: [finding()] }),
				fix: () => fixed({ deviations, choices, unsure }),
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
	assert.deepEqual(
		result.stages.map((entry) => entry.stage),
		["review", "fix:1:haiku", "close:1", "comment"],
	);
});

test("a reviewer's question that changes no code, and a pre-existing decision finding, are carried without a stop", async () => {
	const host = asked({ id: "host-version", changesCode: false });
	const old = finding({ kind: "decision", preExisting: true });
	const result = outcome(
		await runWorkflow(
			"review-and-fix",
			ARGS,
			agents({ review: reviewed({ findings: [old], questions: [host] }) }),
		),
	);

	assert.equal(result.status, "clean");
	assert.equal(result.rounds, 0);
	assert.deepEqual(result.carried["asides"], [host]);
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
			"review-and-fix",
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
			"review-and-fix",
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
			runWorkflow("review-and-fix", ARGS, agents(report)),
			/to more than one item/,
		);
	}
});

test("a fixer's question or contested item naming a finding its brief did not carry fails at its stage", async () => {
	const defect = finding();
	const reports: readonly Reports[] = [
		{
			review: reviewed({ findings: [defect] }),
			fix: () => fixed({ questions: [question(1, { finding: "cache-path" })] }),
		},
		{
			review: reviewed({ findings: [defect] }),
			fix: () =>
				fixed({
					contested: [
						{
							finding: "cache-path",
							decision: "The loader owns the guard",
							reason: "The repair moves it.",
						},
					],
				}),
		},
	];

	for (const report of reports) {
		await assert.rejects(
			runWorkflow("review-and-fix", ARGS, agents(report)),
			/its brief did not carry/,
		);
	}
});

test("an answer of the wrong shape for what it answers fails at the stop", async () => {
	await assert.rejects(
		runWorkflow(
			"review-and-fix",
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
				"review-and-fix",
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

	const counts: readonly unknown[] = [0, 1.5, "three", { action: "fix" }];
	for (const answer of counts) {
		await assert.rejects(
			runWorkflow(
				"review-and-fix",
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
			runWorkflow("review-and-fix", ARGS, async (prompt, options) =>
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
			"review-and-fix",
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

test("a resumed run returns nothing from before the stop its answers reply to", async () => {
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
	const result = outcome(
		await runWorkflow(
			"review-and-fix",
			{ ...ARGS, answers: { "stored-field": { action: "fix" } } },
			agents({
				review: reviewed({ findings: [decision, old], questions: [host] }),
				fix: () => fixed({ deviations: since }),
			}),
		),
	);

	assert.deepEqual(result.carried, { ...EMPTY_CARRIED, deviations: since });
	assert.deepEqual(
		result.stages.map((entry) => entry.stage),
		["fix:1:opus", "close:1", "comment"],
	);
});
