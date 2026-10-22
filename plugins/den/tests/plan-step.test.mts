// Tests for the plan-step script, run the way a preamble runs it: through the
// launcher, each over a plan file of its own. The markdown's layout is free to
// change, so a case reads the output only for what it must hold.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dataDir, fixtureDir, runtimes } from "../../../tests/harness.mts";

const PLUGIN = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const LAUNCHER = join(PLUGIN, "lib", "shared", "launch.mjs");

/**
 * Runs the script through the launcher with `argument` as its argument
 * string, and returns what it printed.
 */
function run(argument: string, data: string): string {
	const result = spawnSync(
		process.execPath,
		[LAUNCHER, "--data", data, "scripts/plan-step", argument],
		{ encoding: "utf8" },
	);

	assert.equal(result.status, 0, result.stderr);

	return result.stdout;
}

/** A step titled `title` with `status`, relying on survey fact F1. */
const step = (title: string, status: string) => ({
	title,
	status,
	summary: "s",
	gate: [],
	reliesOn: [{ kind: "fact", id: "F1" }],
});

/**
 * Writes a plan of `steps` to a directory whose name holds a space, with
 * survey fact F1's evidence two code blocks, one reading `src.txt` beside it
 * and one a file that is not there, and returns the plan file's path.
 */
function writePlan(...steps: object[]): string {
	const dir = join(fixtureDir("plan-step-src"), "with space");

	mkdirSync(dir);
	writeFileSync(join(dir, "src.txt"), "the source line\n");

	const file = join(dir, "plan.json");
	const evidence = ["src.txt", "missing.txt"].map((name) => ({
		kind: "code",
		from: { absolutePath: join(dir, name), lines: [1, 1] },
	}));

	writeFileSync(
		file,
		JSON.stringify({
			title: "A plan",
			problem: "p",
			goal: "g",
			survey: [{ id: "F1", claim: "c", evidence }],
			steps,
		}),
	);

	return file;
}

for (const runtime of runtimes()) {
	test(`[${runtime}] a step number picks that step, the line ahead of it names the sources left unread, and a fact it relies on gives where its evidence sits and none of the file's text`, () => {
		const file = writePlan(
			step("First step", "committed"),
			step("Second step", "pending"),
		);
		const out = run(`${file} 2`, dataDir(runtime));
		const [line = "", ...rest] = out.split("\n");
		const markdown = rest.join("\n");
		const unread = `${join(file, "..", "missing.txt")}:1–1`;

		assert.ok(line.startsWith("Plan step: A plan ("), out);
		assert.ok(line.includes(unread), `${unread} in ${line}`);
		assert.ok(markdown.includes("Second step"), out);
		assert.ok(!markdown.includes("First step"), out);
		assert.ok(!markdown.includes("the source line"), out);

		for (const name of ["src.txt", "missing.txt"]) {
			const where = `${join(file, "..", name)}:1–1`;

			assert.ok(markdown.includes(where), `${where} in ${markdown}`);
		}
	});

	test(`[${runtime}] without a number, the step in progress is picked, and every step where none is`, () => {
		const picked = run(
			writePlan(
				step("First step", "committed"),
				step("Second step", "inProgress"),
			),
			dataDir(runtime),
		);
		const every = run(
			writePlan(
				step("First step", "committed"),
				step("Second step", "pending"),
			),
			dataDir(runtime),
		);

		assert.ok(
			picked.includes("Second step") && !picked.includes("First step"),
			picked,
		);
		assert.ok(
			every.includes("Second step") && every.includes("First step"),
			every,
		);
	});

	test(`[${runtime}] a step the plan lacks prints the reason alone`, () => {
		const out = run(
			`${writePlan(step("Only step", "pending"))} 2`,
			dataDir(runtime),
		);

		assert.notEqual(out.trim(), "");
		assert.ok(!out.includes("Only step"), out);
	});
}
