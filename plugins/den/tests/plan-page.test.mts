// Tests for the plan-page script and the libraries that read a plan and write
// its page. The unit cases call `loadPlan`, `normaliseGitPaths`,
// `resolveSources` and `renderPage` directly; the launcher cases run the
// command the skill's preamble runs, each over a plan file and a temp
// directory of its own.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
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
import { runInNewContext } from "node:vm";
import { dataDir, fixtureDir, runtimes } from "../../../tests/harness.mts";
import { normaliseGitPaths } from "../lib/plan/git-paths.mts";
import { loadPlan } from "../lib/plan/load.mts";
import { renderPage } from "../lib/plan/page.mts";
import { resolveSources } from "../lib/plan/sources.mts";
import { fieldsOf } from "../lib/shared/fields.mts";

const PLUGIN = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const LAUNCHER = join(PLUGIN, "lib", "shared", "launch.mjs");

/**
 * Writes `lines` to `name` under `dir`, each ending in a newline, and returns
 * the file's path.
 */
function writeLines(dir: string, name: string, ...lines: string[]): string {
	const file = join(dir, name);

	writeFileSync(file, lines.map((line) => `${line}\n`).join(""));

	return file;
}

/** A code block reading `lines` of the file at `absolutePath`. */
const codeAt = (absolutePath: string, lines: [number, number]) => ({
	kind: "code",
	from: { absolutePath, lines },
});

/** A plan of one pending step whose change is `blocks`. */
const oneStep = (...blocks: object[]) => ({
	title: "A plan",
	steps: [{ title: "The step", status: "pending", proposedChange: blocks }],
});

test("a gitPath is read from disk, or from git at a commit, relative to the plan's repository, with either separator", () => {
	const repo = fixtureDir("plan-page-repo");
	const gitIn = (...args: string[]) =>
		execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });

	gitIn("init", "-q");
	mkdirSync(join(repo, "src"));
	writeLines(repo, "src/a.txt", "one", "two", "three");
	gitIn("add", "src/a.txt");
	gitIn(
		"-c",
		"user.name=t",
		"-c",
		"user.email=t@t",
		"commit",
		"-q",
		"-m",
		"v1",
	);

	const commit = gitIn("rev-parse", "HEAD").trim();

	writeLines(repo, "src/a.txt", "ONE", "TWO", "THREE");

	const onDisk = (gitPath: string) => ({
		kind: "code",
		from: { gitPath, lines: [2, 3] },
	});
	const atCommit = (gitPath: string) => ({
		kind: "code",
		from: { gitPath, lines: [2, 3], commit },
	});
	const file = join(repo, "plan.json");

	writeFileSync(
		file,
		JSON.stringify(
			oneStep(
				onDisk("src/a.txt"),
				onDisk("src\\a.txt"),
				atCommit("src/a.txt"),
				atCommit("src\\a.txt"),
			),
		),
	);

	const loaded = loadPlan(file);

	assert.ok(!("failure" in loaded), JSON.stringify(loaded));
	assert.deepEqual(loaded.unread, []);

	const [step] = loaded.plan["steps"] as { proposedChange: object[] }[];

	assert.deepEqual(
		step?.proposedChange.map((block) => fieldsOf(block)["resolved"]),
		[
			{ text: "TWO\nTHREE\n", firstLine: 2 },
			{ text: "TWO\nTHREE\n", firstLine: 2 },
			{ text: "two\nthree\n", firstLine: 2 },
			{ text: "two\nthree\n", firstLine: 2 },
		],
	);
});

test("every gitPath turns to forward slashes: open questions, and code, diff, sketch and image blocks wherever they sit", () => {
	const planOpen = { id: "q_plan", question: "q", gitPath: "a\\plan.md" };
	const stepOpen = { id: "q_step", question: "q", gitPath: "b\\step\\" };
	const diff = { kind: "diff", gitPath: "c\\diff.rs", patch: "" };
	const from = { gitPath: "d\\code.rs", lines: [1, 1] };
	const sketch = { kind: "sketch", gitPath: "e\\sketch.rs", text: "" };
	const image = { kind: "image", gitPath: "f\\shot.png", alt: "a" };

	normaliseGitPaths({
		title: "A plan",
		decisions: { open: [planOpen] },
		survey: [{ id: "F1", claim: "c", evidence: [diff] }],
		steps: [
			{
				title: "The step",
				status: "pending",
				decisions: { open: [stepOpen] },
				proposedChange: [
					{ kind: "code", from },
					{ kind: "row", blocks: [sketch, image] },
				],
			},
		],
	});

	assert.deepEqual(
		[planOpen, stepOpen, diff, from, sketch, image].map((x) => x.gitPath),
		[
			"a/plan.md",
			"b/step/",
			"c/diff.rs",
			"d/code.rs",
			"e/sketch.rs",
			"f/shot.png",
		],
	);
});

test("code blocks are read wherever the page shows one, a level down in rows and facts included", () => {
	const dir = fixtureDir("plan-page-src");
	const file = writeLines(dir, "src.txt", "only");
	const blocks = Array.from({ length: 6 }, () => codeAt(file, [1, 1]));
	const [survey, lands, change, relies, inRow, inFact] = blocks;
	const plan = {
		title: "A plan",
		survey: [{ id: "F1", claim: "c", evidence: [survey] }],
		steps: [
			{
				title: "The step",
				status: "pending",
				afterItLands: [lands],
				proposedChange: [
					change,
					{ kind: "row", blocks: [inRow, { kind: "text", markdown: "x" }] },
				],
				reliesOn: [
					{ ...relies, caption: "why" },
					{ kind: "fact", id: "F1", evidence: [inFact] },
				],
			},
		],
	};

	resolveSources(plan, join(dir, "plan.json"));

	const reliesOn = plan.steps[0]?.reliesOn ?? [];

	for (const block of [survey, lands, change, inRow, inFact, reliesOn[0]]) {
		assert.deepEqual((block as { resolved?: unknown }).resolved, {
			text: "only\n",
			firstLine: 1,
		});
	}
});

test("a range running past the file's end fails its block, and one ending on the last line reads", () => {
	const dir = fixtureDir("plan-page-src");
	const file = writeLines(dir, "src.txt", "a", "b", "c");
	const fits = codeAt(file, [3, 3]);
	const past = { ...codeAt(file, [3, 4]), resolved: { text: "stale" } };
	const unread = resolveSources(oneStep(fits, past), join(dir, "plan.json"));

	assert.deepEqual(fits, { ...fits, resolved: { text: "c\n", firstLine: 3 } });
	assert.equal("resolved" in past, false);
	assert.equal(typeof (past as { error?: unknown }).error, "string");
	assert.deepEqual(
		unread.map((source) => source.source),
		[`${file}:3–4`],
	);
});

test("a range ending on a blank line keeps the blank line", () => {
	const dir = fixtureDir("plan-page-src");
	const file = writeLines(dir, "src.txt", "alpha", "", "beta");
	const block = codeAt(file, [1, 2]);

	resolveSources(oneStep(block), join(dir, "plan.json"));

	assert.deepEqual(block, {
		...block,
		resolved: { text: "alpha\n\n", firstLine: 1 },
	});
});

test("an image is carried as a data URI of its bytes, and a missing one fails its block", () => {
	const dir = fixtureDir("plan-page-src");
	const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);

	writeFileSync(join(dir, "shot.png"), bytes);

	const found = {
		kind: "image",
		alt: "a",
		absolutePath: join(dir, "shot.png"),
	};
	const missing = {
		kind: "image",
		alt: "b",
		absolutePath: join(dir, "no.png"),
	};
	const unread = resolveSources(
		oneStep(found, missing),
		join(dir, "plan.json"),
	);

	assert.deepEqual((found as { resolved?: unknown }).resolved, {
		src: `data:image/png;base64,${bytes.toString("base64")}`,
	});
	assert.equal(typeof (missing as { error?: unknown }).error, "string");
	assert.deepEqual(
		unread.map((source) => source.source),
		[join(dir, "no.png")],
	);
});

/** The text of the script element whose opening tag is `opening` in `html`. */
function scriptText(html: string, opening: string): string {
	const start = html.indexOf(opening) + opening.length;

	return html.slice(start, html.indexOf("</script>", start));
}

test("the page carries the plan and its problems as JSON no string in them can close, and marked inlined", () => {
	const plan = { title: "</script><script>alert(1)</script>", steps: [] };
	const problems = ["</script><script>alert(2)</script>"];
	const html = renderPage(plan, problems);
	const marked = readFileSync(
		join(PLUGIN, "lib", "plan", "marked.min.js"),
		"utf8",
	);
	const jsonIn = (id: string) =>
		JSON.parse(scriptText(html, `<script type="application/json" id="${id}">`));

	assert.deepEqual(jsonIn("plan"), plan);
	assert.deepEqual(jsonIn("problems"), problems);
	assert.ok(html.includes(`<script id="marked">${marked}</script>`));
});

/**
 * Runs the script the way the skill does, through the launcher. The child
 * takes its temp directory from TMPDIR, TEMP and TMP, so those point at a
 * fixture directory and no test page reaches the real one.
 */
function run(file: string, data: string): { out: string; temp: string } {
	const temp = fixtureDir("plan-page-temp");
	const result = spawnSync(
		process.execPath,
		[LAUNCHER, "--data", data, "scripts/plan-page", file],
		{
			encoding: "utf8",
			// biome-ignore lint/style/noProcessEnv: the child needs PATH to find its interpreter.
			env: { ...process.env, TMPDIR: temp, TEMP: temp, TMP: temp },
		},
	);

	assert.equal(result.status, 0, result.stderr);

	return { out: result.stdout, temp };
}

/** The pages a run left in the script's page directory under `temp`. */
function pagesIn(temp: string): readonly string[] {
	const dir = join(temp, "claude-den-plan-pages");

	return existsSync(dir) ? readdirSync(dir).map((name) => join(dir, name)) : [];
}

for (const runtime of runtimes()) {
	test(`[${runtime}] a plan is written as one page named for its file, and the plan file is left as it was`, () => {
		const dir = fixtureDir("plan-page-src");
		const source = writeLines(dir, "src.txt", "x");
		const file = join(dir, "cache-wake.json");
		const text = JSON.stringify({
			title: "Cache wake",
			steps: [
				{ title: "One", status: "committed" },
				{ title: "Two", status: "inProgress" },
				{
					title: "Three",
					status: "pending",
					reliesOn: [{ ...codeAt(source, [1, 1]), caption: "why" }],
				},
			],
		});

		writeFileSync(file, text);

		const { out, temp } = run(file, dataDir(runtime));
		const [path, ...more] = pagesIn(temp);

		assert.ok(path !== undefined && more.length === 0, out);
		assert.ok(
			path.startsWith(join(temp, "claude-den-plan-pages", "cache-wake-")),
			path,
		);
		assert.equal(
			out,
			`Plan page: ${path} (Cache wake; 3 steps, 1 committed, 1 in progress, 1 pending)\n`,
		);
		assert.equal(readFileSync(file, "utf8"), text);
	});

	test(`[${runtime}] a problem the checks find is named on the line`, () => {
		const file = join(fixtureDir("plan-page-src"), "twice.json");

		writeFileSync(
			file,
			JSON.stringify({
				title: "Twice",
				survey: [
					{ id: "F7", claim: "a" },
					{ id: "F7", claim: "b" },
				],
				steps: [{ title: "One", status: "pending" }],
			}),
		);

		const { out, temp } = run(file, dataDir(runtime));
		const [path] = pagesIn(temp);

		assert.ok(path !== undefined, out);
		assert.ok(out.slice(out.indexOf(path) + path.length).includes("F7"), out);
	});

	test(`[${runtime}] the page's diff parser runs as the generator's does`, () => {
		const file = join(fixtureDir("plan-page-src"), "diff.json");
		const patch = [
			"--- a/one.txt",
			"+++ b/one.txt",
			"@@ -1 +1 @@",
			"-a",
			"+b",
			"--- a/two.txt",
			"+++ b/two.txt",
			"@@ -4 +4 @@",
			"-c",
		].join("\n");

		writeFileSync(file, JSON.stringify(oneStep()));

		const { out, temp } = run(file, dataDir(runtime));
		const [path] = pagesIn(temp);

		assert.ok(path !== undefined, out);

		const script = scriptText(
			readFileSync(path, "utf8"),
			'<script id="diff-parser">',
		);
		const parsed = runInNewContext(
			`${script}\nJSON.stringify(diffRows(${JSON.stringify(patch)}))`,
		);

		assert.deepEqual(JSON.parse(parsed), {
			rows: [
				{ kind: "file", text: "one.txt" },
				{ kind: "hunk", text: "⋯ " },
				{ kind: "removed", text: "-a", oldLine: 1 },
				{ kind: "added", text: "+b", newLine: 1 },
				{ kind: "file", text: "two.txt" },
				{ kind: "hunk", text: "⋯ " },
				{ kind: "removed", text: "-c", oldLine: 4 },
			],
			files: ["one.txt", "two.txt"],
			numbered: true,
		});
	});

	test(`[${runtime}] the page's block walk runs without the module it came from, a step's blocks in the order the checks walk them`, () => {
		const file = join(fixtureDir("plan-page-src"), "walk.json");

		writeFileSync(file, JSON.stringify(oneStep()));

		const { out, temp } = run(file, dataDir(runtime));
		const [path] = pagesIn(temp);

		assert.ok(path !== undefined, out);

		const script = scriptText(
			readFileSync(path, "utf8"),
			'<script id="block-walk">',
		);
		const step = {
			afterItLands: [{ kind: "text", markdown: "lands" }],
			proposedChange: [
				{
					kind: "row",
					blocks: [null, { kind: "text", markdown: "in row" }],
				},
			],
			reliesOn: [
				{
					kind: "fact",
					id: "F1",
					evidence: [{ kind: "text", markdown: "evidence" }],
				},
			],
		};
		const walked = runInNewContext(
			`${script}\nJSON.stringify([...blocksIn(${JSON.stringify(step)})].map((b) => b.markdown ?? b.kind))`,
		);

		assert.deepEqual(JSON.parse(walked), [
			"lands",
			"row",
			"in row",
			"fact",
			"evidence",
		]);
	});

	test(`[${runtime}] JSON that does not parse is reported, not rendered`, () => {
		const file = join(fixtureDir("plan-page-src"), "broken.json");

		writeFileSync(file, '{ "title": ');

		const { out, temp } = run(file, dataDir(runtime));

		assert.notEqual(out.trim(), "");
		assert.deepEqual(pagesIn(temp), []);
	});

	test(`[${runtime}] no argument is reported, not rendered`, () => {
		const { out, temp } = run("", dataDir(runtime));

		assert.notEqual(out.trim(), "");
		assert.deepEqual(pagesIn(temp), []);
	});
}
