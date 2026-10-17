// Tests for the checks run on every plan loaded. Each case is a clean plan
// with one fault added, so the problems found are counted rather than read:
// their wording is free to change.
import assert from "node:assert/strict";
import { test } from "node:test";
import { planProblems } from "../lib/plan/checks.mts";

/** A plan the checks find nothing in, with `steps` as its steps. */
const plan = (...steps: unknown[]): Record<string, unknown> => ({
	title: "A plan",
	survey: [{ id: "F1", claim: "c" }],
	decisions: { open: [{ id: "q_plan", question: "q" }] },
	proposals: [{ id: "p_plan", choice: "c", status: "approved" }],
	steps,
});

/** A step whose change is `change`, relying on survey fact F1. */
const step = (...change: unknown[]) => ({
	title: "The step",
	status: "pending",
	proposedChange: change,
	reliesOn: [{ kind: "fact", id: "F1" }],
});

const twoFiles = [
	"--- a/one.txt",
	"+++ b/one.txt",
	"@@ -1 +1 @@",
	"-a",
	"+b",
	"--- a/two.txt",
	"+++ b/two.txt",
	"@@ -1 +1 @@",
	"-c",
	"+d",
].join("\n");

const cases: [string, Record<string, unknown>, number][] = [
	[
		"a clean plan",
		plan(step({ kind: "text", markdown: "x", about: ["q_plan"] })),
		0,
	],
	[
		"a survey fact ID used twice",
		{ ...plan(step()), survey: [{ id: "F1" }, { id: "F1" }] },
		1,
	],
	[
		"an ID used three times, named once",
		plan({ ...step(), proposals: [{ id: "F1" }, { id: "F1" }] }),
		1,
	],
	[
		"two survey facts with no ID",
		{
			...plan(step()),
			survey: [{ id: "F1", claim: "c" }, { claim: "a" }, { claim: "b" }],
		},
		2,
	],
	[
		"an open question with no ID",
		{ ...plan(step()), decisions: { open: [{ question: "q" }] } },
		1,
	],
	[
		"a block about an open question the plan lacks",
		plan(step({ kind: "text", markdown: "x", about: ["q_missing"] })),
		1,
	],
	[
		"a fact block naming a fact the survey lacks, inside a row",
		plan(
			step({
				kind: "row",
				blocks: [
					{ kind: "text", markdown: "x" },
					{ kind: "fact", id: "F9" },
				],
			}),
		),
		1,
	],
	[
		"a diff block covering two files",
		plan(step({ kind: "diff", gitPath: "one.txt", patch: twoFiles })),
		1,
	],
	[
		"a relied-on block without a caption",
		plan({ ...step(), reliesOn: [{ kind: "text", markdown: "x" }] }),
		1,
	],
	["a step that is not an object", plan(step(), null), 1],
	[
		"a proposal that is not an object",
		{ ...plan(step()), proposals: [null] },
		1,
	],
];

for (const [name, given, found] of cases) {
	test(`${name}: ${found} problem${found === 1 ? "" : "s"} found`, () => {
		assert.equal(planProblems(given).length, found, name);
	});
}
