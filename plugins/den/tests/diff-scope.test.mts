// The scope script renders the change a reviewer is given. What it asserts:
// a file the implementer wrote and nobody added is part of a working-tree
// change and appears as the new-file hunk it becomes once added, while a
// range between two revisions holds no working tree and leaves it out. Each
// case builds its own repository under a temp directory, so nothing about
// this checkout, or the case before, reaches it.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const PLUGIN = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SCRIPT = join(PLUGIN, "scripts", "diff-scope.sh");

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" });
}

/** A repository with one committed file, `tracked.txt`, and nothing else. */
function repository(): string {
	const cwd = mkdtempSync(join(tmpdir(), "den-diff-scope-"));
	git(cwd, "init", "-q", "-b", "main");
	git(cwd, "config", "user.email", "test@example.invalid");
	git(cwd, "config", "user.name", "test");
	writeFileSync(join(cwd, "tracked.txt"), "one\n");
	git(cwd, "add", "tracked.txt");
	git(cwd, "commit", "-q", "-m", "base");
	return cwd;
}

function scope(cwd: string, range: string): string {
	return execFileSync("bash", [SCRIPT, range], { cwd, encoding: "utf8" });
}

test("an untracked file is rendered as a new-file hunk of the working tree", () => {
	const cwd = repository();
	writeFileSync(join(cwd, "module.txt"), "alpha\nbeta\n");

	const out = scope(cwd, "");

	assert.match(out, /new file mode/);
	assert.match(out, /\+alpha\n\+beta/);
	assert.match(out, /module\.txt \| new file, 2 lines/);
	assert.doesNotMatch(out, /The diff is empty/);
});

test("an ignored file stays out", () => {
	const cwd = repository();
	writeFileSync(join(cwd, ".gitignore"), "build/\n");
	git(cwd, "add", ".gitignore");
	git(cwd, "commit", "-q", "-m", "ignore");
	execFileSync("bash", ["-c", "mkdir build && printf 'x\\n' > build/out.txt"], {
		cwd,
	});

	const out = scope(cwd, "");

	assert.doesNotMatch(out, /build\/out\.txt/);
	assert.match(out, /The diff is empty/);
});

test("a pathspec after -- filters untracked files too", () => {
	const cwd = repository();
	writeFileSync(join(cwd, "in.txt"), "in\n");
	writeFileSync(join(cwd, "out.txt"), "out\n");

	const out = scope(cwd, "HEAD -- in.txt");

	assert.match(out, /\+in\n/);
	assert.doesNotMatch(out, /\+out\n/);
});

test("a range between two revisions leaves the working tree out", () => {
	const cwd = repository();
	writeFileSync(join(cwd, "tracked.txt"), "one\ntwo\n");
	git(cwd, "commit", "-q", "-am", "second");
	writeFileSync(join(cwd, "module.txt"), "alpha\n");

	const out = scope(cwd, "HEAD~1..HEAD");

	assert.match(out, /\+two\n/);
	// Status still lists the file, since it is the status; the change does not.
	assert.doesNotMatch(out, /new file mode/);
	assert.doesNotMatch(out, /\+alpha/);
});
