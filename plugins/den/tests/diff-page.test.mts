// The diff-page script renders a change as a page file. What it asserts: a
// run that renders writes one page and prints a line, the page holds one
// section per changed file, an untracked file among them, a file whose only
// change is whitespace included, content is HTML-escaped, and an empty diff
// is reported rather than rendered; and the word diff of a prose file parses
// into its lines. What the printed line says is not read. Each case builds
// its own repository under a temp directory and runs the script through the
// launcher, the exact command the skill's preamble runs.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dataDir, fixtureDir, runtimes } from "../../../tests/harness.mts";
import { parseDiff, parseWordDiff } from "../lib/git-diff.mts";

const PLUGIN = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const LAUNCHER = join(PLUGIN, "lib", "shared", "launch.mjs");

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" });
}

/** A repository with one committed file, `tracked.txt`, and nothing else. */
function repository(): string {
	const cwd = mkdtempSync(join(tmpdir(), "den-diff-page-"));
	git(cwd, "init", "-q", "-b", "main");
	git(cwd, "config", "user.email", "test@example.invalid");
	git(cwd, "config", "user.name", "test");
	writeFileSync(join(cwd, "tracked.txt"), "one\n");
	git(cwd, "add", "tracked.txt");
	git(cwd, "commit", "-q", "-m", "base");
	return cwd;
}

/**
 * Runs the script the way the skill does, through the launcher. The page
 * goes under the OS temp directory, which the child reads from TMPDIR, TEMP
 * and TMP, so those point at a fixture directory and no test page reaches
 * the real one. `path`, where given, is the child's PATH.
 */
function page(
	cwd: string,
	data: string,
	range: string,
	path?: string,
): { out: string; temp: string } {
	const temp = fixtureDir("diff-page-temp");
	const run = spawnSync(
		process.execPath,
		[LAUNCHER, "--data", data, "scripts/diff-page", range],
		{
			cwd,
			encoding: "utf8",
			env: {
				// biome-ignore lint/style/noProcessEnv: the child needs PATH to find its interpreter.
				...process.env,
				...(path === undefined ? {} : { PATH: path }),
				TMPDIR: temp,
				TEMP: temp,
				TMP: temp,
			},
		},
	);

	assert.equal(run.status, 0, run.stderr);

	return { out: run.stdout, temp };
}

/** The pages a run left in the script's page directory under `temp`. */
function pagesIn(temp: string): readonly string[] {
	const dir = join(temp, "claude-den-diff-pages");

	return existsSync(dir) ? readdirSync(dir).map((name) => join(dir, name)) : [];
}

/**
 * The one page a run wrote, asserted to be the only page there and to have a
 * line printed about it.
 */
function written(run: { out: string; temp: string }): string {
	const [path, ...more] = pagesIn(run.temp);

	assert.ok(path !== undefined && more.length === 0, run.out);
	assert.notEqual(run.out.trim(), "");

	return path;
}

/** The lines of the first hunk of the first file a line diff holds. */
function firstHunk(diff: string) {
	const [file] = parseDiff(diff);

	return file?.body.kind === "lines" ? file.body.hunks[0]?.lines : undefined;
}

test("a deleted line beginning with `-- ` is content, not a file header", () => {
	const diff =
		"diff --git a/q.sql b/q.sql\n--- a/q.sql\n+++ b/q.sql\n@@ -1,2 +1 @@\n one\n--- note\n";

	assert.equal(parseDiff(diff)[0]?.removed, 1);
	assert.deepEqual(
		firstHunk(diff)?.filter((line) => line.kind === "del"),
		[{ kind: "del", text: "-- note" }],
	);
});

test("the newline ending the diff is not a context line", () => {
	assert.deepEqual(
		firstHunk(
			"diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1,2 @@\n one\n+two\n",
		)?.map((line) => line.kind),
		["ctx", "add"],
	);
});

// A paragraph rewrapped, a paragraph removed, a word swapped and a line
// added, in that order.
const PROSE_BEFORE = [
	"Alpha beta gamma delta epsilon zeta eta theta",
	"iota kappa lambda.",
	"",
	"Second paragraph stays here.",
	"",
	"Third paragraph to remove",
	"across two lines.",
	"",
	"Fourth para has a swap word.",
	"last line",
];
const PROSE_AFTER = [
	"Alpha beta gamma delta",
	"epsilon zeta eta theta iota kappa lambda.",
	"",
	"Second paragraph stays here.",
	"",
	"Fourth para has a changed word.",
	"last line",
	"new line added",
];

test("a prose word diff parses into lines of kept, removed and added words", () => {
	const cwd = repository();

	writeFileSync(join(cwd, "a.md"), `${PROSE_BEFORE.join("\n")}\n`);
	git(cwd, "add", "a.md");
	git(cwd, "commit", "-q", "-m", "prose");
	writeFileSync(join(cwd, "a.md"), `${PROSE_AFTER.join("\n")}\n`);

	const hunks = parseWordDiff(
		git(cwd, "diff", "--word-diff=porcelain", "--", "a.md"),
	).get("a.md");
	const ctx = (text: string) => ({ kind: "ctx", text });

	assert.deepEqual(hunks?.[0]?.lines, [
		[ctx("Alpha beta gamma delta")],
		[ctx("epsilon zeta eta theta iota kappa lambda.")],
		[],
		[ctx("Second paragraph stays here.")],
		[],
		[{ kind: "del", text: "Third paragraph to remove" }],
		[
			{ kind: "del", text: "across two lines." },
			ctx("Fourth para has a "),
			{ kind: "del", text: "swap" },
			{ kind: "add", text: "changed" },
			ctx(" word."),
		],
		[ctx("last line")],
		[{ kind: "add", text: "new line added" }],
	]);
});

/** The page of a one-line change to a Rust file, run on the node leg. */
function codePage(path?: string): string {
	const cwd = repository();
	writeFileSync(join(cwd, "a.rs"), "fn f() {\n    g(1);\n}\n");
	git(cwd, "add", "a.rs");
	git(cwd, "commit", "-q", "-m", "code");
	writeFileSync(join(cwd, "a.rs"), "fn f() {\n    g(2);\n}\n");

	return readFileSync(written(page(cwd, dataDir("node"), "", path)), "utf8");
}

test("with no difft on PATH, a code file keeps its line diff", () => {
	// git's own program directory holds git and never difft.
	const html = codePage(git(".", "--exec-path").trim());

	assert.doesNotMatch(html, /class="syntax"/);
	assert.match(html, /<tr class="add">.*g\(2\);/);
});

const DIFFT =
	spawnSync("difft", ["--version"], { stdio: "ignore" }).status === 0;

test("with difft on PATH, a code file is diffed by syntax", {
	skip: !DIFFT && "difft did not answer a version probe",
}, () => {
	const html = codePage();

	assert.match(html, /<table class="syntax">/);
	assert.match(html, /g\(<del>1<\/del>\);/);
	assert.match(html, /g\(<ins>2<\/ins>\);/);
});

for (const runtime of runtimes()) {
	test(`[${runtime}] the page has a section per file, the untracked one included, escaped`, () => {
		const cwd = repository();
		writeFileSync(join(cwd, "tracked.txt"), "one\nif a < b && c { two }\n");
		writeFileSync(join(cwd, "module.txt"), "alpha\nbeta\n");

		const html = readFileSync(written(page(cwd, dataDir(runtime), "")), "utf8");

		assert.equal(html.match(/<details class="file"/g)?.length, 2);
		assert.match(html, /<span class="path">tracked\.txt<\/span>/);
		assert.match(html, /<span class="path">module\.txt<\/span>/);
		assert.match(html, /\+alpha|>alpha</);
		assert.match(html, /if a &lt; b &amp;&amp; c \{ two \}/);
		assert.doesNotMatch(html, /a < b && c/);
	});

	test(`[${runtime}] an empty diff is reported, not rendered`, () => {
		const cwd = repository();

		const run = page(cwd, dataDir(runtime), "");

		assert.notEqual(run.out.trim(), "");
		assert.deepEqual(pagesIn(run.temp), []);
	});

	test(`[${runtime}] a range between two revisions leaves the working tree out`, () => {
		const cwd = repository();
		writeFileSync(join(cwd, "tracked.txt"), "one\ntwo\n");
		git(cwd, "commit", "-q", "-am", "second");
		writeFileSync(join(cwd, "module.txt"), "alpha\n");

		const html = readFileSync(
			written(page(cwd, dataDir(runtime), "HEAD~1..HEAD")),
			"utf8",
		);

		assert.equal(html.match(/<details class="file"/g)?.length, 1);
		assert.doesNotMatch(html, /module\.txt/);
	});

	test(`[${runtime}] a diff past a megabyte is rendered`, () => {
		const cwd = repository();
		const big = Array.from(
			{ length: 40_000 },
			(_, i) => `line ${i} of a file wide enough to pass a megabyte`,
		).join("\n");
		writeFileSync(join(cwd, "big.txt"), `${big}\n`);
		git(cwd, "add", "big.txt");
		git(cwd, "commit", "-q", "-m", "big");
		rmSync(join(cwd, "big.txt"));

		written(page(cwd, dataDir(runtime), ""));
	});

	test(`[${runtime}] a pathspec names untracked files from the working directory, as it names tracked ones`, () => {
		const cwd = repository();
		mkdirSync(join(cwd, "sub", "src"), { recursive: true });
		mkdirSync(join(cwd, "src"), { recursive: true });
		writeFileSync(join(cwd, "sub", "src", "inside.txt"), "alpha\n");
		writeFileSync(join(cwd, "src", "outside.txt"), "beta\n");

		const html = readFileSync(
			written(page(join(cwd, "sub"), dataDir(runtime), "-- src")),
			"utf8",
		);

		assert.match(html, /sub\/src\/inside\.txt/);
		assert.doesNotMatch(html, /src\/outside\.txt/);
	});

	test(`[${runtime}] diff.noprefix in the user's config does not empty the page`, () => {
		const cwd = repository();
		git(cwd, "config", "diff.noprefix", "true");
		writeFileSync(join(cwd, "tracked.txt"), "one\ntwo\n");

		written(page(cwd, dataDir(runtime), ""));
	});

	test(`[${runtime}] a file whose only change is whitespace has a section and no lines`, () => {
		const cwd = repository();
		writeFileSync(join(cwd, "tracked.txt"), "  one\n");

		const html = readFileSync(written(page(cwd, dataDir(runtime), "")), "utf8");

		assert.match(html, /<span class="path">tracked\.txt<\/span>/);
		assert.doesNotMatch(html, /<tr class="(add|del)">/);
	});

	test(`[${runtime}] an option beside a revision leaves the untracked files in`, () => {
		const cwd = repository();
		writeFileSync(join(cwd, "module.txt"), "alpha\n");

		assert.match(
			readFileSync(written(page(cwd, dataDir(runtime), "-W HEAD")), "utf8"),
			/module\.txt/,
		);
	});
}
