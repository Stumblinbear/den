// The review skill's entry point: the scope through diff-scope.sh, then the
// plan's path when the argument named one. What it asserts: both spellings
// of `--plan` are lifted out and rendered after the diff, the rest of the
// argument reaches diff-scope.sh unchanged, and an empty argument renders
// the working tree with no plan line. Each case builds its own repository.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const PLUGIN = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SCRIPT = join(PLUGIN, "scripts", "review-scope.sh");

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" });
}

/** A repository with one committed file, `tracked.txt`, and nothing else. */
function repository(): string {
	const cwd = mkdtempSync(join(tmpdir(), "den-review-scope-"));
	git(cwd, "init", "-q", "-b", "main");
	git(cwd, "config", "user.email", "test@example.invalid");
	git(cwd, "config", "user.name", "test");
	writeFileSync(join(cwd, "tracked.txt"), "one\n");
	git(cwd, "add", "tracked.txt");
	git(cwd, "commit", "-q", "-m", "base");
	return cwd;
}

function scope(cwd: string, argument: string): string {
	return execFileSync("bash", [SCRIPT, argument], { cwd, encoding: "utf8" });
}

test("--plan <path> renders the plan's path after the diff", () => {
	const cwd = repository();
	writeFileSync(join(cwd, "tracked.txt"), "one\ntwo\n");

	const out = scope(cwd, "HEAD --plan docs/plan.md");

	assert.match(out, /\+two\n/);
	assert.match(out, /\nPlan or brief: `docs\/plan\.md`\n$/);
	assert.ok(out.indexOf("+two") < out.indexOf("Plan or brief"));
});

test("--plan=<path> is the same argument", () => {
	const cwd = repository();

	const out = scope(cwd, "--plan=docs/plan.md");

	assert.match(out, /Range: `git diff HEAD`/);
	assert.match(out, /Plan or brief: `docs\/plan\.md`/);
});

test("a range with -- path passes through to the diff", () => {
	const cwd = repository();
	writeFileSync(join(cwd, "tracked.txt"), "one\ntwo\n");
	writeFileSync(join(cwd, "other.txt"), "other\n");

	const out = scope(cwd, "HEAD -- tracked.txt --plan p.md");

	assert.match(out, /Range: `git diff HEAD -- tracked\.txt`/);
	assert.match(out, /\+two\n/);
	assert.doesNotMatch(out, /\+other/);
	assert.match(out, /Plan or brief: `p\.md`/);
});

test("an empty argument renders the working tree and no plan line", () => {
	const cwd = repository();
	writeFileSync(join(cwd, "tracked.txt"), "one\ntwo\n");

	const out = scope(cwd, "");

	assert.match(out, /Range: `git diff HEAD`/);
	assert.match(out, /\+two\n/);
	assert.doesNotMatch(out, /Plan or brief/);
});
