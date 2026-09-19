// Both versions of the files a range changed, read from git. What it
// asserts: a range between two revisions reads both from them, a renamed
// file's old version from its old path; a range against the working tree
// reads the new version from the file on disk; and the texts come back
// whole where a character is more than a byte, as `git cat-file --batch`
// counts its sizes in bytes.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { diffArgs } from "../lib/diff-args.mts";
import { readSides } from "../lib/diff-sides.mts";

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" });
}

// Enough lines alike that git reads the moved file as a rename.
const BODY = "fn one() {}\nfn two() {}\nfn three() {}\nfn four() {}\n";

test("each changed file's two versions are read as the range names them", () => {
	const cwd = mkdtempSync(join(tmpdir(), "den-diff-sides-"));
	git(cwd, "init", "-q", "-b", "main");
	git(cwd, "config", "user.email", "test@example.invalid");
	git(cwd, "config", "user.name", "test");
	writeFileSync(join(cwd, "a.rs"), "// café\n");
	writeFileSync(join(cwd, "old.rs"), BODY);
	git(cwd, "add", ".");
	git(cwd, "commit", "-q", "-m", "base");
	writeFileSync(join(cwd, "a.rs"), "// crème brûlée\n");
	renameSync(join(cwd, "old.rs"), join(cwd, "new.rs"));
	writeFileSync(join(cwd, "new.rs"), `${BODY}fn five() {}\n`);
	git(cwd, "add", "-A");
	git(cwd, "commit", "-q", "-m", "second");
	writeFileSync(join(cwd, "a.rs"), "// naïve\n");
	// The range is listed where this process runs, as the page lists it.
	process.chdir(cwd);

	const committed = readSides(cwd, diffArgs("HEAD~1 HEAD"), ["a.rs", "new.rs"]);
	const working = readSides(cwd, diffArgs(""), ["a.rs"]);

	assert.deepEqual(committed.get("a.rs"), {
		old: "// café\n",
		now: "// crème brûlée\n",
	});
	assert.deepEqual(committed.get("new.rs"), {
		old: BODY,
		now: `${BODY}fn five() {}\n`,
	});
	assert.deepEqual(working.get("a.rs"), {
		old: "// crème brûlée\n",
		now: "// naïve\n",
	});
});
