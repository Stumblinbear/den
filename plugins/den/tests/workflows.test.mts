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

test("review questions retain attribution and remain separate from findings", async () => {
	const questions = ["Is the second host a confirmed requirement?"];
	const readers = new Set<string>();
	const result = await runWorkflow(
		"flag-review",
		{ scope: "HEAD", basis: BASIS },
		async (prompt, options) => {
			assert.ok(prompt.includes(BASIS));
			if (options.agentType !== "den:review-synthesizer") {
				readers.add(options.agentType);
				assert.ok(options.schema?.required.includes("questions"));
				assert.equal(
					prompt.includes(questions[0] ?? "missing question"),
					false,
				);
				return {
					findings: [],
					cleared: [],
					questions:
						options.agentType === "den:decisions-reviewer" ? questions : [],
				};
			}
			assert.equal(readers.size, 3);
			assert.match(prompt, /Findings[^\n]*:\n\[\]/);
			const section = prompt.split("Unresolved questions, per reader:\n")[1];
			assert.ok(section);
			assert.ok(section.includes(`decisions:\n- ${questions[0]}`));
			assert.equal(section.includes(`quality:\n- ${questions[0]}`), false);
			assert.equal(section.includes(`bugs:\n- ${questions[0]}`), false);
			return "No findings. One unresolved question.";
		},
	);
	assert.equal(result, "No findings. One unresolved question.");
});

test("standalone reviews retain scope-only calls", async () => {
	for (const args of ["HEAD", { scope: "HEAD" }]) {
		assert.equal(
			await runWorkflow("flag-review", args, async (_prompt, options) =>
				options.agentType === "den:review-synthesizer"
					? "No findings."
					: { findings: [], cleared: [], questions: [] },
			),
			"No findings.",
		);
	}
});

test("review rejects invalid basis and undeclared arguments before dispatch", async () => {
	for (const extra of [
		{ basis: 2 },
		{ basis: "x".repeat(6001) },
		{ verdict: "clean" },
	]) {
		await assert.rejects(
			runWorkflow("flag-review", { scope: "HEAD", ...extra }, async () => {
				assert.fail("invalid input must not launch an agent");
			}),
			/basis|scope/,
		);
	}
});

test("review does not synthesize a clean report from missing coverage", async () => {
	await assert.rejects(
		runWorkflow("flag-review", "HEAD", async (_prompt, options) => {
			assert.notEqual(options.agentType, "den:review-synthesizer");
			return options.agentType === "den:decisions-reviewer"
				? { findings: [], cleared: [] }
				: { findings: [], cleared: [], questions: [] };
		}),
		/incomplete/i,
	);
});
