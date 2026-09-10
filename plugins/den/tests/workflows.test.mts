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
