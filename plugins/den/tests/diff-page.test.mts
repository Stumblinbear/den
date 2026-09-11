// The diff-page script renders a change as a page file. What it asserts: the
// line it prints names a file that exists, the page holds one section per
// changed file, an untracked file among them, content is HTML-escaped, and an
// empty diff is reported rather than rendered. Each case builds its own
// repository under a temp directory and runs the script through the launcher,
// the exact command the skill's preamble runs.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
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
import { parseDiff } from "../lib/diff-page.mts";

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
 * the real one.
 */
function page(
	cwd: string,
	data: string,
	range: string,
): { out: string; temp: string } {
	const temp = fixtureDir("diff-page-temp");
	const run = spawnSync(
		process.execPath,
		[LAUNCHER, "--data", data, "scripts/diff-page", range],
		{
			cwd,
			encoding: "utf8",
			// biome-ignore lint/style/noProcessEnv: the child needs PATH to find its interpreter.
			env: { ...process.env, TMPDIR: temp, TEMP: temp, TMP: temp },
		},
	);

	assert.equal(run.status, 0, run.stderr);

	return { out: run.stdout, temp };
}

test("a deleted line beginning with `-- ` is content, not a file header", () => {
	const [file] = parseDiff(
		"diff --git a/q.sql b/q.sql\n--- a/q.sql\n+++ b/q.sql\n@@ -1,2 +1 @@\n one\n--- note\n",
	);

	assert.equal(file?.removed, 1);
	assert.deepEqual(
		file?.hunks[0]?.lines.filter((line) => line.kind === "del"),
		[{ kind: "del", text: "-- note" }],
	);
});

test("the newline ending the diff is not a context line", () => {
	const [file] = parseDiff(
		"diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1,2 @@\n one\n+two\n",
	);

	assert.deepEqual(
		file?.hunks[0]?.lines.map((line) => line.kind),
		["ctx", "add"],
	);
});

for (const runtime of runtimes()) {
	test(`[${runtime}] the page has a section per file, the untracked one included, escaped`, () => {
		const cwd = repository();
		writeFileSync(join(cwd, "tracked.txt"), "one\nif a < b && c { two }\n");
		writeFileSync(join(cwd, "module.txt"), "alpha\nbeta\n");

		const { out, temp } = page(cwd, dataDir(runtime), "");
		const named =
			/^Diff page: (.+\.html) \(git diff HEAD; 2 files, \+3 −0\)$/m.exec(out);

		assert.ok(named !== null, out);

		const path = named[1] ?? "";

		assert.ok(existsSync(path), path);
		assert.ok(path.startsWith(join(temp, "claude-den-diff-pages")), path);

		const html = readFileSync(path, "utf8");

		assert.equal(html.match(/<details class="file"/g)?.length, 2);
		assert.match(html, /<span class="path">tracked\.txt<\/span>/);
		assert.match(html, /<span class="path">module\.txt<\/span>/);
		assert.match(html, /\+alpha|>alpha</);
		assert.match(html, /if a &lt; b &amp;&amp; c \{ two \}/);
		assert.doesNotMatch(html, /a < b && c/);
	});

	test(`[${runtime}] an empty diff is reported, not rendered`, () => {
		const cwd = repository();

		const { out } = page(cwd, dataDir(runtime), "");

		assert.match(out, /The diff is empty\./);
		assert.doesNotMatch(out, /Diff page:/);
	});

	test(`[${runtime}] a range between two revisions leaves the working tree out`, () => {
		const cwd = repository();
		writeFileSync(join(cwd, "tracked.txt"), "one\ntwo\n");
		git(cwd, "commit", "-q", "-am", "second");
		writeFileSync(join(cwd, "module.txt"), "alpha\n");

		const { out } = page(cwd, dataDir(runtime), "HEAD~1..HEAD");
		const named = /^Diff page: (.+\.html) /m.exec(out);

		assert.ok(named !== null, out);

		const html = readFileSync(named[1] ?? "", "utf8");

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

		const { out } = page(cwd, dataDir(runtime), "");

		assert.match(out, /^Diff page: .* 1 file, \+0 −40000\)$/m);
	});

	test(`[${runtime}] a pathspec names untracked files from the working directory, as it names tracked ones`, () => {
		const cwd = repository();
		mkdirSync(join(cwd, "sub", "src"), { recursive: true });
		mkdirSync(join(cwd, "src"), { recursive: true });
		writeFileSync(join(cwd, "sub", "src", "inside.txt"), "alpha\n");
		writeFileSync(join(cwd, "src", "outside.txt"), "beta\n");

		const { out } = page(join(cwd, "sub"), dataDir(runtime), "-- src");
		const named = /^Diff page: (.+\.html) /m.exec(out);

		assert.ok(named !== null, out);

		const html = readFileSync(named[1] ?? "", "utf8");

		assert.match(html, /sub\/src\/inside\.txt/);
		assert.doesNotMatch(html, /src\/outside\.txt/);
	});

	test(`[${runtime}] diff.noprefix in the user's config does not empty the page`, () => {
		const cwd = repository();
		git(cwd, "config", "diff.noprefix", "true");
		writeFileSync(join(cwd, "tracked.txt"), "one\ntwo\n");

		const { out } = page(cwd, dataDir(runtime), "");

		assert.match(out, /^Diff page: .* 1 file, \+1 −0\)$/m);
	});
}
