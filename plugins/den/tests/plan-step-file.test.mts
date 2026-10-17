// Tests for the step file plan-step writes, which an agent reads, not the
// user: the user's decisions in it are named as the user's, and a sketch's
// code keeps its lines whole.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fixtureDir } from "../../../tests/harness.mts";
import { loadPlan } from "../lib/plan/load.mts";
import { renderStepMarkdown } from "../lib/plan/step-markdown.mts";

/** Writes `plan` into `dir` and returns step 1 as the step file has it. */
function stepFile(plan: object, dir: string): string {
	const file = join(dir, "plan.json");

	writeFileSync(file, JSON.stringify(plan));

	const loaded = loadPlan(file);

	assert.ok(!("failure" in loaded), JSON.stringify(loaded));

	return renderStepMarkdown(loaded, [0]);
}

test("the step file heads the user's decisions as the user's, not the reading agent's", () => {
	const written = stepFile(
		{
			title: "A plan",
			decisions: {
				user: [{ key: "opening_shape", choice: "c", why: "w" }],
			},
			steps: [{ title: "One", status: "inProgress", summary: "s", gate: [] }],
		},
		fixtureDir("plan-step-file"),
	);

	assert.ok(written.includes("opening_shape"), written);
	assert.ok(!/\byour decisions\b/i.test(written), written);
});

test("a sketched decision's code keeps its lines whole however long", () => {
	const code =
		"fn f() { let x = 1; /* a comment running well past the hundred columns the file wraps prose at */ }";
	const written = stepFile(
		{
			title: "A plan",
			steps: [
				{
					title: "One",
					status: "inProgress",
					summary: "s",
					gate: [],
					decisions: {
						user: [
							{ key: "shape", sketch: `\`\`\`rust\n${code}\n\`\`\``, why: "w" },
						],
					},
				},
			],
		},
		fixtureDir("plan-step-file"),
	);

	assert.ok(written.includes(code), written);
});
