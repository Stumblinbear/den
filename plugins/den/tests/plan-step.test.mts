// Tests for the plan-step script, run the way a preamble runs it: through the
// launcher, each over a plan file and a temp directory of its own. The file's
// layout is free to change, so a case reads it only for what it must hold.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dataDir, fixtureDir, runtimes } from "../../../tests/harness.mts";

const PLUGIN = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const LAUNCHER = join(PLUGIN, "lib", "shared", "launch.mjs");

/**
 * Runs the script through the launcher with `argument` as its argument
 * string, its temp directory a fixture of its own, and returns what it
 * printed with the files it wrote.
 */
function run(
	argument: string,
	data: string,
): { out: string; files: readonly string[] } {
	const temp = fixtureDir("plan-step-temp");
	const result = spawnSync(
		process.execPath,
		[LAUNCHER, "--data", data, "scripts/plan-step", argument],
		{
			encoding: "utf8",
			// biome-ignore lint/style/noProcessEnv: the child needs PATH to find its interpreter.
			env: { ...process.env, TMPDIR: temp, TEMP: temp, TMP: temp },
		},
	);

	assert.equal(result.status, 0, result.stderr);

	const dir = join(temp, "claude-den-plan-steps");
	const files = existsSync(dir)
		? readdirSync(dir).map((name) => join(dir, name))
		: [];

	return { out: result.stdout, files };
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
	test(`[${runtime}] a step number picks that step, and a fact it relies on gives where its evidence sits and none of the file's text, a missing file included`, () => {
		const file = writePlan(
			step("First step", "committed"),
			step("Second step", "pending"),
		);
		const { out, files } = run(`${file} 2`, dataDir(runtime));
		const [path, ...more] = files;

		assert.ok(path !== undefined && more.length === 0, out);
		assert.ok(out.startsWith(`Plan step: ${path} (`), out);

		const written = readFileSync(path, "utf8");

		assert.ok(written.includes("Second step"), written);
		assert.ok(!written.includes("First step"), written);
		assert.ok(!written.includes("the source line"), written);

		for (const name of ["src.txt", "missing.txt"]) {
			const where = `${join(file, "..", name)}:1–1`;

			assert.ok(written.includes(where), `${where} in ${written}`);
		}

		const unread = `${join(file, "..", "missing.txt")}:1–1`;

		assert.ok(out.includes(unread), `${unread} in ${out}`);
	});

	test(`[${runtime}] without a number, the step in progress is picked, and every step where none is`, () => {
		const one = run(
			writePlan(
				step("First step", "committed"),
				step("Second step", "inProgress"),
			),
			dataDir(runtime),
		);
		const none = run(
			writePlan(
				step("First step", "committed"),
				step("Second step", "pending"),
			),
			dataDir(runtime),
		);
		const [onePath] = one.files;
		const [nonePath] = none.files;

		assert.ok(onePath !== undefined, one.out);
		assert.ok(nonePath !== undefined, none.out);

		const picked = readFileSync(onePath, "utf8");
		const every = readFileSync(nonePath, "utf8");

		assert.ok(picked.includes("Second step") && !picked.includes("First step"));
		assert.ok(every.includes("Second step") && every.includes("First step"));
	});

	test(`[${runtime}] a step the plan lacks is reported, not written`, () => {
		const file = writePlan(step("Only step", "pending"));
		const { out, files } = run(`${file} 2`, dataDir(runtime));

		assert.notEqual(out.trim(), "");
		assert.deepEqual(files, []);
	});
}
