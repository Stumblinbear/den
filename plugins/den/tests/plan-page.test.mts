// The plan-page library and the script the skill runs with it. The unit cases
// go from a plan's markdown to the HTML the page carries; the launcher cases
// run the exact command the skill's preamble runs, over a plan file and a
// temp directory of their own.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dataDir, fixtureDir, runtimes } from "../../../tests/harness.mts";
import { parsePlan, renderPage } from "../lib/plan-page.mts";

const PLUGIN = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const LAUNCHER = join(PLUGIN, "lib", "shared", "launch.mjs");

const md = (...lines: readonly string[]): string => `${lines.join("\n")}\n`;

/** A plan's markdown as a page, under the plan's own title. */
function page(markdown: string): string {
	const plan = parsePlan(markdown);

	return renderPage(plan, plan.title);
}

/** A plan in the shape: a prose section, then a step in each of the states. */
const PLAN = md(
	"# Cache wake",
	"",
	"An idle session is woken before its prompt cache expires.",
	"",
	"Not doing: a store of plans.",
	"",
	"## How the pieces call each other",
	"",
	"```text",
	"watcher -> wake",
	"```",
	"",
	"## Step 1: the pure decision [committed]",
	"",
	"Gate: the tests green.",
	"",
	"## Step 2: the wake [in progress]",
	"",
	"Tests: the launcher cases.",
	"",
	"## Step 3: the notice [pending]",
	"",
	"Open: whether the notice names the model.",
);

test("the labelled lines the shape names are picked out, the user's decisions pilled", () => {
	const html = page(
		md(
			"# A plan",
			"",
			"Goal: a plan is read away from the terminal.",
			"",
			"Not doing: a store of plans.",
			"",
			"Constraints: nothing under the repository is written.",
			"",
			"## Step 1: the library [pending]",
			"",
			"Decided: the renderer lives in den. Rejected: the job's directory.",
			"",
			"Proposed: pages go under their own directory. Rejected: one shared one.",
			"",
			"Open: whether a plan carries its date.",
			"",
			"Tests: the units below.",
			"",
			"Gate: the tests green on node and bun.",
		),
	);

	assert.match(html, /<p><b>Goal\.<\/b> a plan is read away from/);
	assert.match(html, /<p><b>Not doing\.<\/b> a store of plans\.<\/p>/);
	assert.match(html, /<p><b>Constraints\.<\/b> nothing under/);
	assert.match(
		html,
		/<div class="decided"><p><span class="you">you<\/span>the renderer lives in den\./,
	);
	assert.match(
		html,
		/<div class="proposed"><p><b>Proposed<\/b> pages go under/,
	);
	assert.equal(html.match(/<span class="alt">Rejected:<\/span>/g)?.length, 2);
	assert.match(html, /<div class="open"><b>Open decision<\/b> whether a plan/);
	assert.match(html, /<p><b>Tests\.<\/b> the units below\.<\/p>/);
	assert.match(html, /<p class="gate"><b>Gate<\/b> the tests green on node/);
	assert.match(html, /<span class="state next">pending<\/span>/);
});

test("the alternative is greyed inside a decision and nowhere else", () => {
	const html = page(
		md(
			"# A plan",
			"",
			"Decided: pages go under their own directory. Rejected: one shared one.",
			"",
			"Tests: the grey span, and that a Rejected: clause elsewhere is plain.",
		),
	);

	assert.equal(html.match(/<span class="alt">Rejected:<\/span>/g)?.length, 1);
	assert.match(
		html,
		/<p><b>Tests\.<\/b> the grey span, and that a Rejected: clause elsewhere is plain\.<\/p>/,
	);
});

test("two labelled lines one under the other are two lines", () => {
	const html = page(
		md(
			"# A plan",
			"",
			"## Step 1: the library [pending]",
			"",
			"Tests: the units below.",
			"Gate: the tests green on node and bun.",
		),
	);

	assert.match(html, /<p><b>Tests\.<\/b> the units below\.<\/p>/);
	assert.match(
		html,
		/<p class="gate"><b>Gate<\/b> the tests green on node and bun\.<\/p>/,
	);
});

test("a code span is escaped and left out of the bold pass, and a number beside one survives", () => {
	const html = page(
		md(
			"# A plan",
			"",
			"The **shape** is `a < b` in step 3 of 4, and `**not bold**` stays literal.",
		),
	);

	assert.match(html, /<b>shape<\/b>/);
	assert.match(html, /<code>a &lt; b<\/code>/);
	assert.match(html, /in step 3 of 4,/);
	assert.match(html, /<code>\*\*not bold\*\*<\/code>/);
	assert.doesNotMatch(html, /undefined/);
});

test("a diff fence is coloured under the caption its info string carries", () => {
	const html = page(
		md(
			"# A plan",
			"",
			"```diff plugins/den/skills/lead/SKILL.md:99-102",
			" the sequence is put to the user",
			"-before the first step",
			"+as a page before the first step",
			"```",
		),
	);

	assert.match(
		html,
		/<div class="cap">plugins\/den\/skills\/lead\/SKILL\.md:99-102<\/div>/,
	);
	assert.match(html, /<span class="del">-before the first step<\/span>/);
	assert.match(
		html,
		/<span class="add">\+as a page before the first step<\/span>/,
	);
	assert.match(html, /<pre> the sequence is put to the user\n/);
});

test("a fence closes only on a run as long as the one that opened it", () => {
	const html = page(
		md(
			"# A plan",
			"",
			"````md plugins/den/skills/plan-page/SKILL.md:9-11",
			"# A plan as a page",
			"",
			"```text",
			"watcher -> wake",
			"```",
			"````",
			"",
			"After the fence.",
		),
	);

	assert.equal(html.match(/<div class="code">/g)?.length, 1);
	assert.match(
		html,
		/<div class="cap">plugins\/den\/skills\/plan-page\/SKILL\.md:9-11<\/div>/,
	);
	assert.match(html, /```text\nwatcher -&gt; wake\n```/);
	assert.match(html, /<p>After the fence\.<\/p>/);
});

test("angle brackets in pasted code arrive escaped", () => {
	const html = page(
		md(
			"# A plan",
			"",
			"```ts plugins/den/lib/plan-page.mts:22-27",
			"const steps: Array<Section> = [];",
			"```",
		),
	);

	assert.match(html, /const steps: Array&lt;Section&gt; = \[\];/);
	assert.doesNotMatch(html, /Array<Section>/);
});

test("a heading that numbers no step is a card and no row", () => {
	const html = page(PLAN);

	assert.equal(html.match(/<table class="grid">/g)?.length, 1);
	assert.equal(html.match(/<tr><td>\d+<\/td>/g)?.length, 3);
	assert.match(html, /<a href="#s1">the pure decision<\/a>/);
	assert.match(html, /<div class="card" id="x0"><h2>How the pieces call each/);
	assert.doesNotMatch(html, /<a href="#x0">/);
});

test("a plan with no numbered step renders without the step table", () => {
	const html = page(md("# Notes", "", "## What is here", "", "prose."));

	assert.doesNotMatch(html, /<table class="grid">/);
	assert.match(html, /<div class="card" id="x0">/);
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

/** A plan file written under a fixture directory, for the script to read. */
function planFile(name: string, text: string): string {
	const file = join(fixtureDir("plan-page-src"), name);

	writeFileSync(file, text);

	return file;
}

for (const runtime of runtimes()) {
	test(`[${runtime}] a plan is written as one page, named for its file`, () => {
		const { out, temp } = run(
			planFile("cache-wake.md", PLAN),
			dataDir(runtime),
		);
		const [path, ...more] = pagesIn(temp);

		assert.ok(path !== undefined && more.length === 0, out);
		assert.ok(
			path.startsWith(join(temp, "claude-den-plan-pages", "cache-wake-")),
			path,
		);
		assert.notEqual(out.trim(), "");

		const html = readFileSync(path, "utf8");

		assert.match(html, /<h1>Cache wake<\/h1>/);
		assert.match(html, /<span class="state done">committed<\/span>/);
	});

	test(`[${runtime}] a file that cannot be read is reported, not rendered`, () => {
		const missing = join(fixtureDir("plan-page-src"), "nothing.md");

		const { out, temp } = run(missing, dataDir(runtime));

		assert.notEqual(out.trim(), "");
		assert.deepEqual(pagesIn(temp), []);
	});

	test(`[${runtime}] no argument is reported, not rendered`, () => {
		const { out, temp } = run("", dataDir(runtime));

		assert.notEqual(out.trim(), "");
		assert.deepEqual(pagesIn(temp), []);
	});
}

test("a line opening with a hash that is no title or section heading is prose, not a hang", () => {
	const file = planFile(
		"sub.md",
		md("# A plan", "", "### A subheading", "", "prose.", ""),
	);
	const temp = fixtureDir("plan-page-temp");
	const result = spawnSync(
		process.execPath,
		[LAUNCHER, "--data", dataDir("node"), "scripts/plan-page", file],
		{
			encoding: "utf8",
			timeout: 10_000,
			// biome-ignore lint/style/noProcessEnv: the child needs PATH to find its interpreter.
			env: { ...process.env, TMPDIR: temp, TEMP: temp, TMP: temp },
		},
	);

	assert.equal(
		result.signal,
		null,
		`killed by ${result.signal} after the timeout: the parser never advanced past the line`,
	);
	assert.equal(pagesIn(temp).length, 1, result.stdout);
});
