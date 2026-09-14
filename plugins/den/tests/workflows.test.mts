import assert from "node:assert/strict";
import { test } from "node:test";
import {
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

const BRIEF = "Move the guard into the loader, with the test the plan names.";

const ARGS = {
	brief: BRIEF,
	plan: "docs/plans/loader.md",
	basis: "Confirmed: the loader owns the guard (user).",
	implementer: "opus",
	reviewer: "fable",
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
	readonly built?: string;
	readonly verification?: string;
	readonly questions?: readonly unknown[];
	readonly decisions?: readonly unknown[];
	readonly ruling?: unknown;
	readonly stages: readonly Stage[];
	readonly carried: Record<string, readonly unknown[]>;
}

const outcome = (result: unknown) => result as Outcome;

/** The report of the run's one `stage` entry; any other count fails the test. */
function reportOf(result: unknown, stage: string): Record<string, unknown> {
	const entries = outcome(result).stages.filter(
		(entry) => entry.stage === stage,
	);

	assert.equal(entries.length, 1, `${stage} entries: ${entries.length}`);

	return entries[0]?.report ?? {};
}

const THREAD_HEADING =
	"Every question raised on this brief, each with its answer:";

/** The answered thread parsed back out of the end of a continuation prompt. */
function threadIn(prompt: string): Record<string, unknown>[] {
	const start = prompt.indexOf(THREAD_HEADING);

	assert.notEqual(start, -1, "the prompt carries no answered thread");

	return JSON.parse(prompt.slice(start + THREAD_HEADING.length));
}

/** The report an implementer stopped with, parsed back out of a continuation prompt. */
function stateIn(prompt: string): Record<string, unknown> {
	const heading = "The report it stopped with:";
	const start = prompt.indexOf(heading);
	const end = prompt.indexOf(THREAD_HEADING);

	assert.ok(start !== -1 && end > start, "the prompt carries no report");

	return JSON.parse(prompt.slice(start + heading.length, end));
}

const question = (index: number) => ({
	id: `guard-${index}`,
	question: `Does the guard own cache path ${index}?`,
	evidence: `lib/loader.mjs:${index}`,
	alternatives: [{ option: "Keep it in the loader", cost: "One more branch" }],
	waits: `The cache path ${index}`,
});

const implemented = (over: Record<string, unknown> = {}) => ({
	built: "The guard is in the loader, with its test.",
	questions: [],
	deviations: [],
	choices: [],
	unsure: [],
	verification: "14 tests, 0 failures.",
	...over,
});

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

test("invalid implement arguments are rejected before any agent launches", async () => {
	const rejected: readonly (readonly [Record<string, unknown>, RegExp])[] = [
		[{ ...ARGS, brief: "  " }, /brief/],
		[{ ...ARGS, brief: undefined }, /brief/],
		[{ ...ARGS, plan: 7 }, /plan/],
		[{ ...ARGS, basis: undefined }, /basis/],
		[{ ...ARGS, basis: "x".repeat(6001) }, /basis/],
		[{ ...ARGS, implementer: "sonnet" }, /implementer/],
		[{ ...ARGS, implementer: undefined }, /implementer/],
		[{ ...ARGS, reviewer: "haiku" }, /reviewer/],
		[{ ...ARGS, fixRounds: 1.5 }, /fixRounds/],
		[{ ...ARGS, answers: [["The loader owns it"]] }, /answers/],
		[{ ...ARGS, answers: { "guard-1": null } }, /answers/],
		[{ ...ARGS, range: "HEAD~1" }, /nothing else/],
	];

	for (const [args, message] of rejected) {
		await assert.rejects(
			runWorkflow("implement", args, async () => {
				assert.fail("invalid arguments must not launch an agent");
			}),
			message,
		);
	}
});

test("the implementer tier names the agent the step runs on", async () => {
	for (const tier of ["opus", "haiku", "fable"]) {
		const launched: string[] = [];
		await runWorkflow(
			"implement",
			{ ...ARGS, implementer: tier },
			async (_prompt, options) => {
				launched.push(options.agentType);
				return options.agentType === "den:reviewer"
					? reviewed()
					: implemented();
			},
		);

		assert.deepEqual(launched, [`den:implementer-${tier}`, "den:reviewer"]);
	}
});

test("an unanswered implementer stop holds its questions and runs no reviewer", async () => {
	const questions = [question(1), question(2)];
	let launches = 0;
	const result = await runWorkflow(
		"implement",
		ARGS,
		async (prompt, options) => {
			launches += 1;
			assert.equal(options.agentType, "den:implementer-opus");
			assert.ok(prompt.includes(BRIEF));
			assert.ok(options.schema?.required.includes("questions"));
			return implemented({ questions });
		},
	);

	assert.equal(launches, 1);
	assert.deepEqual(result, {
		status: "stopped",
		stop: 0,
		at: "implement",
		questions,
		built: "The guard is in the loader, with its test.",
		verification: "14 tests, 0 failures.",
		stages: [{ stage: "implement", report: implemented({ questions }) }],
		carried: EMPTY_CARRIED,
	});
});

test("answering every id continues the implementer, then the review runs on the reviewer's model", async () => {
	const questions = [question(1), question(2)];
	const answers = {
		"guard-1": "The loader owns it",
		"guard-2": "Leave the flag alone",
	};
	const prompts: string[] = [];
	const launched: {
		readonly type: string;
		readonly model: string | undefined;
	}[] = [];
	const result = await runWorkflow(
		"implement",
		{ ...ARGS, reviewer: "opus", answers },
		async (prompt, options) => {
			prompts.push(prompt);
			launched.push({ type: options.agentType, model: options.model });
			if (options.agentType === "den:reviewer") {
				return reviewed();
			}
			return implemented(prompts.length === 1 ? { questions } : {});
		},
	);

	assert.deepEqual(launched, [
		{ type: "den:implementer-opus", model: undefined },
		{ type: "den:implementer-opus", model: undefined },
		{ type: "den:reviewer", model: "opus" },
	]);

	const continuation = prompts[1] ?? "";
	const { questions: _asked, ...state } = implemented({ questions });

	assert.ok(continuation.includes(BRIEF));
	assert.ok(continuation.includes("docs/plans/loader.md"));
	assert.deepEqual(stateIn(continuation), state);
	assert.deepEqual(threadIn(continuation), [
		{ ...question(1), answer: "The loader owns it" },
		{ ...question(2), answer: "Leave the flag alone" },
	]);
	assert.equal(outcome(result).status, "reviewed");
});

test("a stop answered in part is rejected at the stop", async () => {
	let launches = 0;
	await assert.rejects(
		runWorkflow(
			"implement",
			{ ...ARGS, answers: { "guard-1": "The loader owns it" } },
			async (_prompt, options) => {
				assert.notEqual(options.agentType, "den:reviewer");
				launches += 1;
				return implemented({ questions: [question(1), question(2)] });
			},
		),
		/answered whole/,
	);
	assert.equal(launches, 1);
});

test("an answer no stop asked for ends the run", async () => {
	await assert.rejects(
		runWorkflow(
			"implement",
			{ ...ARGS, answers: { "guard-9": "For a question nobody raised" } },
			async (_prompt, options) =>
				options.agentType === "den:reviewer" ? reviewed() : implemented(),
		),
		/guard-9/,
	);
});

test("a report that gives one id to two items is rejected at its stage", async () => {
	const reports: readonly (readonly [string, unknown])[] = [
		[
			"den:implementer-opus",
			implemented({ questions: [question(1), question(1)] }),
		],
		["den:reviewer", reviewed({ findings: [finding(), finding()] })],
		[
			"den:reviewer",
			reviewed({
				findings: [finding({ id: "flag-owner" })],
				questions: [asked()],
			}),
		],
	];

	for (const [stage, report] of reports) {
		await assert.rejects(
			runWorkflow("implement", ARGS, async (_prompt, options) =>
				options.agentType === stage ? report : implemented(),
			),
			/to more than one item/,
		);
	}
});

test("a second stop is numbered after the first and holds only its own questions", async () => {
	const first = [question(1)];
	const second = [question(2), question(3)];
	let implementers = 0;
	const result = await runWorkflow(
		"implement",
		{ ...ARGS, answers: { "guard-1": "The loader owns it" } },
		async (_prompt, options) => {
			assert.notEqual(options.agentType, "den:reviewer");
			implementers += 1;
			return implemented({ questions: implementers === 1 ? first : second });
		},
	);

	assert.equal(implementers, 2);
	assert.equal(outcome(result).stop, 1);
	assert.equal(outcome(result).at, "implement");
	assert.deepEqual(outcome(result).questions, second);
});

test("adding an answer leaves every prompt before that stop untouched", async () => {
	const record = async (answers: Record<string, unknown>) => {
		const prompts: string[] = [];
		await runWorkflow(
			"implement",
			{ ...ARGS, answers },
			async (prompt, options) => {
				prompts.push(prompt);
				if (options.agentType === "den:reviewer") {
					return reviewed();
				}
				return implemented(
					prompts.length <= 2 ? { questions: [question(prompts.length)] } : {},
				);
			},
		);
		return prompts;
	};

	const first = await record({});
	const second = await record({ "guard-1": "The loader owns it" });
	const third = await record({
		"guard-1": "The loader owns it",
		"guard-2": "And the cache path",
	});

	assert.deepEqual([first.length, second.length, third.length], [1, 2, 4]);
	assert.deepEqual(first, third.slice(0, first.length));
	assert.deepEqual(second, third.slice(0, second.length));
});

test("a stopped implementer's deviations and choices are carried with the stop", async () => {
	const deviations = [
		{
			what: "Named the guard loadGuard",
			forcedBy: "The brief's name is taken",
			where: "lib/loader.mjs:8",
		},
	];
	const choices = ["Put the guard beside the loader's own tests"];
	const result = await runWorkflow("implement", ARGS, async () =>
		implemented({ questions: [question(1)], deviations, choices }),
	);

	assert.equal(outcome(result).at, "implement");
	assert.deepEqual(outcome(result).carried["deviations"], deviations);
	assert.deepEqual(outcome(result).carried["choices"], choices);
});

test("the reviewer is given the scope and the plan, and nothing of the implementation", async () => {
	let scope = "";
	await runWorkflow("implement", ARGS, async (prompt, options) => {
		if (options.agentType === "den:reviewer") {
			scope = prompt;
			return reviewed();
		}
		return implemented();
	});

	assert.ok(scope.startsWith("Range: HEAD"));
	assert.ok(scope.includes("docs/plans/loader.md"));
	assert.ok(!scope.includes(BRIEF));
	assert.ok(!scope.includes("The guard is in the loader"));
});

test("a decision finding or a question that changes the code stops the run after the review", async () => {
	const decision = finding({
		id: "stored-field",
		kind: "decision",
		title: "Name the stored field",
	});
	const defect = finding();
	const old = finding({
		id: "older-guard",
		preExisting: true,
		title: "Fix the older guard",
	});
	const stopping = [
		{
			review: reviewed({ findings: [decision, defect, old] }),
			decisions: [decision],
			questions: [],
		},
		{
			review: reviewed({
				findings: [defect, old],
				questions: [asked()],
			}),
			decisions: [],
			questions: [asked()],
		},
	];

	for (const { review, decisions, questions } of stopping) {
		const result = await runWorkflow(
			"implement",
			ARGS,
			async (_prompt, options) =>
				options.agentType === "den:reviewer" ? review : implemented(),
		);

		assert.equal(outcome(result).status, "stopped");
		assert.equal(outcome(result).at, "review");
		assert.equal(outcome(result).stop, 0);
		assert.deepEqual(reportOf(result, "review")["findings"], review.findings);
		assert.deepEqual(outcome(result).decisions, decisions);
		assert.deepEqual(outcome(result).questions, questions);
		assert.equal(
			outcome(result).built,
			"The guard is in the loader, with its test.",
		);
		assert.equal(outcome(result).verification, "14 tests, 0 failures.");
		assert.deepEqual(outcome(result).carried["preExisting"], [old]);
	}
});

test("a reviewer's question that changes no code is carried as an aside", async () => {
	const host = asked({ id: "host-version", changesCode: false });
	const result = await runWorkflow(
		"implement",
		ARGS,
		async (_prompt, options) =>
			options.agentType === "den:reviewer"
				? reviewed({ questions: [host] })
				: implemented(),
	);

	assert.equal(outcome(result).status, "reviewed");
	assert.deepEqual(outcome(result).carried["asides"], [host]);
	assert.deepEqual(outcome(result).ruling, {});
});

test("a ruling comes back under the id of the item it answers", async () => {
	const decision = finding({ id: "stored-field", kind: "decision" });
	const ruled: readonly (readonly [
		Record<string, unknown>,
		Record<string, unknown>,
	])[] = [
		[
			{ findings: [decision] },
			{ "stored-field": { action: "fix", instruction: "Name it guardPath" } },
		],
		[{ findings: [decision] }, { "stored-field": { action: "skip" } }],
		[{ questions: [asked()] }, { "flag-owner": "The caller owns the flag" }],
	];

	for (const [review, answers] of ruled) {
		const result = await runWorkflow(
			"implement",
			{ ...ARGS, answers },
			async (_prompt, options) =>
				options.agentType === "den:reviewer" ? reviewed(review) : implemented(),
		);

		assert.equal(outcome(result).status, "reviewed");
		assert.deepEqual(outcome(result).ruling, answers);
	}
});

test("an answer of the wrong shape for what it answers fails at the stop", async () => {
	await assert.rejects(
		runWorkflow(
			"implement",
			{ ...ARGS, answers: { "guard-1": { action: "fix" } } },
			async () => implemented({ questions: [question(1)] }),
		),
		/guard-1 is a question/,
	);

	const wrong: readonly unknown[] = [
		"just fix it",
		{ action: "maybe" },
		{ action: "skip", why: "later" },
		{ action: "fix", instruction: 7 },
	];
	for (const answer of wrong) {
		await assert.rejects(
			runWorkflow(
				"implement",
				{ ...ARGS, answers: { "stored-field": answer } },
				async (_prompt, options) =>
					options.agentType === "den:reviewer"
						? reviewed({
								findings: [finding({ id: "stored-field", kind: "decision" })],
							})
						: implemented(),
			),
			/stored-field is a finding/,
		);
	}
});

test("a finding under an answered question's slug is renamed, and both stops pass", async () => {
	const slug = "cache-path";
	const raised = { ...question(1), id: slug };
	const decision = finding({ id: slug, kind: "decision" });
	const run = (answers: Record<string, unknown>) => {
		let launches = 0;
		return runWorkflow(
			"implement",
			{ ...ARGS, answers },
			async (_prompt, options) => {
				if (options.agentType === "den:reviewer") {
					return reviewed({ findings: [{ ...decision }] });
				}
				launches += 1;
				return implemented(
					launches === 1 ? { questions: [{ ...raised }] } : {},
				);
			},
		);
	};

	const stopped = outcome(await run({ [slug]: "The loader owns it" }));

	assert.equal(stopped.at, "review");
	assert.deepEqual(stopped.decisions, [{ ...decision, id: "cache-path-2" }]);

	const clean = outcome(
		await run({
			[slug]: "The loader owns it",
			"cache-path-2": { action: "fix" },
		}),
	);

	assert.equal(clean.status, "reviewed");
	assert.deepEqual(clean.ruling, { "cache-path-2": { action: "fix" } });
});

test("a rename takes an id no other item in the report has", async () => {
	const slug = "cache-path";
	const sibling: readonly (readonly [
		Record<string, unknown>,
		readonly string[],
	])[] = [
		[{ title: "Guard the empty path" }, ["cache-path-3", "cache-path-2"]],
		[{ kind: "decision" }, ["cache-path-3", "cache-path-2"]],
	];

	for (const [over, expected] of sibling) {
		let launches = 0;
		const result = await runWorkflow(
			"implement",
			{ ...ARGS, answers: { [slug]: "The loader owns it" } },
			async (_prompt, options) => {
				if (options.agentType === "den:reviewer") {
					return reviewed({
						findings: [
							finding({ id: slug, kind: "decision" }),
							finding({ id: "cache-path-2", ...over }),
						],
					});
				}
				launches += 1;
				return implemented(
					launches === 1 ? { questions: [{ ...question(1), id: slug }] } : {},
				);
			},
		);

		const ids = (
			reportOf(result, "review")["findings"] as { id: string }[]
		).map((item) => item.id);

		assert.equal(outcome(result).at, "review");
		assert.deepEqual(ids, expected);
	}
});

test("a continuation reusing its own answered slug is renamed, and both stops pass", async () => {
	const slug = "cache-path";
	const run = (answers: Record<string, unknown>) => {
		let launches = 0;
		return runWorkflow(
			"implement",
			{ ...ARGS, answers },
			async (_prompt, options) => {
				if (options.agentType === "den:reviewer") {
					return reviewed();
				}
				launches += 1;
				return implemented(
					launches <= 2 ? { questions: [{ ...question(1), id: slug }] } : {},
				);
			},
		);
	};

	const stopped = outcome(await run({ [slug]: "The loader owns it" }));

	assert.equal(stopped.at, "implement");
	assert.equal(stopped.stop, 1);
	assert.deepEqual(stopped.questions, [{ ...question(1), id: "cache-path-2" }]);

	const clean = outcome(
		await run({
			[slug]: "The loader owns it",
			"cache-path-2": "And the cache path",
		}),
	);

	assert.equal(clean.status, "reviewed");
});

test("a pre-existing decision finding is carried without stopping the run", async () => {
	const old = finding({ kind: "decision", preExisting: true });
	const result = await runWorkflow(
		"implement",
		ARGS,
		async (_prompt, options) =>
			options.agentType === "den:reviewer"
				? reviewed({ findings: [old] })
				: implemented(),
	);

	assert.equal(outcome(result).status, "reviewed");
	assert.deepEqual(outcome(result).carried["preExisting"], [old]);
	assert.deepEqual(outcome(result).ruling, {});
});

test("a run that never stopped returns one entry per agent it made", async () => {
	const result = await runWorkflow(
		"implement",
		ARGS,
		async (_prompt, options) =>
			options.agentType === "den:reviewer" ? reviewed() : implemented(),
	);

	assert.deepEqual(outcome(result).stages, [
		{ stage: "implement", report: implemented() },
		{ stage: "review", report: reviewed() },
	]);
});

test("a resumed run returns nothing from before the stop its answers reply to", async () => {
	const asleep = [
		{
			what: "Named the guard loadGuard",
			forcedBy: "The brief's name is taken",
			where: "lib/loader.mjs:8",
		},
	];
	const since = [
		{
			what: "Left the flag where it was",
			forcedBy: "The answer names the loader",
			where: "lib/loader.mjs:20",
		},
	];
	const continuation = implemented({
		deviations: since,
		choices: ["Kept the guard beside the loader's tests"],
	});
	let launches = 0;
	const result = await runWorkflow(
		"implement",
		{ ...ARGS, answers: { "guard-1": "The loader owns it" } },
		async (_prompt, options) => {
			if (options.agentType === "den:reviewer") {
				return reviewed();
			}
			launches += 1;
			return launches === 1
				? implemented({ questions: [question(1)], deviations: asleep })
				: continuation;
		},
	);

	assert.deepEqual(outcome(result).stages, [
		{ stage: "implement", report: continuation },
		{ stage: "review", report: reviewed() },
	]);
	assert.deepEqual(outcome(result).carried, {
		...EMPTY_CARRIED,
		deviations: since,
		choices: ["Kept the guard beside the loader's tests"],
	});
});

test("a run resumed after its second stop returns only what came after it", async () => {
	const last = implemented({ built: "The guard and the flag are both in." });
	const prompts: string[] = [];
	let launches = 0;
	const result = await runWorkflow(
		"implement",
		{
			...ARGS,
			answers: {
				"guard-1": "The loader owns it",
				"guard-2": "And the cache path",
			},
		},
		async (prompt, options) => {
			prompts.push(prompt);
			if (options.agentType === "den:reviewer") {
				return reviewed();
			}
			launches += 1;
			return launches <= 2
				? implemented({ questions: [question(launches)] })
				: last;
		},
	);

	// The thread carries every question raised on the brief, the ones from
	// before this stop included, while the stages start again from it.
	assert.deepEqual(threadIn(prompts[2] ?? ""), [
		{ ...question(1), answer: "The loader owns it" },
		{ ...question(2), answer: "And the cache path" },
	]);

	assert.deepEqual(outcome(result).stages, [
		{ stage: "implement", report: last },
		{ stage: "review", report: reviewed() },
	]);
});

test("deviations, choices and unsure items reach a clean return without a stop", async () => {
	const deviations = [
		{
			what: "Named the guard loadGuard",
			forcedBy: "The brief's name is taken",
			where: "lib/loader.mjs:8",
		},
	];
	const choices = ["Put the guard beside the loader's own tests"];
	const unsure = [{ what: "The cache path", why: "No test covers it" }];
	const result = await runWorkflow(
		"implement",
		ARGS,
		async (_prompt, options) =>
			options.agentType === "den:reviewer"
				? reviewed()
				: implemented({ deviations, choices, unsure }),
	);

	assert.equal(outcome(result).status, "reviewed");
	assert.deepEqual(outcome(result).carried, {
		deviations,
		choices,
		unsure,
		preExisting: [],
		asides: [],
		escalations: [],
	});
});

test("an agent that returns nothing usable ends the run at its own stage", async () => {
	for (const missing of ["den:implementer-opus", "den:reviewer"]) {
		await assert.rejects(
			runWorkflow("implement", ARGS, async (_prompt, options) =>
				options.agentType === missing ? null : implemented(),
			),
			/no usable report/,
		);
	}
});

test("a question whose id is a property every object has still stops the run", async () => {
	let launches = 0;
	const result = await runWorkflow(
		"implement",
		{ ...ARGS, answers: { "guard-1": "The loader owns it" } },
		async (_prompt, options) => {
			assert.notEqual(options.agentType, "den:reviewer");
			launches += 1;
			return implemented({
				questions: [launches === 1 ? question(1) : question(2)].map((raised) =>
					launches === 1 ? raised : { ...raised, id: "constructor" },
				),
			});
		},
	);

	assert.equal(outcome(result).status, "stopped");
	assert.equal(outcome(result).stop, 1);
	assert.equal(outcome(result).at, "implement");
});
