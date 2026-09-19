// The scope script renders the change a reviewer is given. What it asserts:
// the repository named is the one diffed, and the one the overflow commands
// name, whatever directory the script runs from; a file the implementer wrote
// and nobody added appears as the new-file hunk it becomes once added, while a
// range between two revisions holds no working tree and leaves it out. Each
// case builds its own repository under a temp directory, so nothing about this
// checkout, or the case before, reaches it.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
	// Quoting pinned on, so the non-ASCII case discriminates on a machine
	// whose global config has it off, and proves the script outranks the
	// repository's own setting.
	git(cwd, "config", "core.quotePath", "true");
	writeFileSync(join(cwd, "tracked.txt"), "one\n");
	git(cwd, "add", "tracked.txt");
	git(cwd, "commit", "-q", "-m", "base");
	return cwd;
}

/** The scope the script renders for `repo`, run from `cwd`. */
function scope(repo: string, range: string, cwd: string = repo): string {
	return execFileSync("bash", [SCRIPT, repo, range], { cwd, encoding: "utf8" });
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

// The tracked diff and the status are repository-wide and root-relative
// whatever the cwd; the untracked rendering has to be too, or a session
// working in a subdirectory reviews a different change from one at the root.
test("untracked files are listed from the root whatever the cwd", () => {
	const cwd = repository();
	mkdirSync(join(cwd, "sub"));
	writeFileSync(join(cwd, "rootnew.txt"), "root-new");
	writeFileSync(join(cwd, "sub", "subnew.txt"), "sub-new\n");

	const out = scope(join(cwd, "sub"), "");

	assert.match(out, /\+root-new/);
	assert.match(out, /\+sub-new/);
	assert.match(out, /sub\/subnew\.txt \| new file, 1 lines/);
	assert.match(out, /rootnew\.txt \| new file, 1 lines/);
});

// git quotes a non-ASCII path unless told not to, and the quoted string
// names no file: an untracked hunk drops and grep complains into the scope,
// and a tracked file is named one way in the status and another in the
// stat, so the per-file command the scope suggests names nothing.
test("a non-ASCII name is rendered unescaped everywhere", () => {
	const cwd = repository();
	writeFileSync(join(cwd, "trä.txt"), "one\n");
	git(cwd, "add", "trä.txt");
	git(cwd, "commit", "-q", "-m", "umlaut");
	writeFileSync(join(cwd, "trä.txt"), "one\ntwo\n");
	writeFileSync(join(cwd, "plüg.txt"), "umlaut\n");

	const out = scope(cwd, "");

	assert.match(out, / M trä\.txt/);
	assert.match(out, /trä\.txt +\| 1 \+/);
	assert.match(out, /\+\+\+ b\/trä\.txt/);
	assert.match(out, /\+umlaut/);
	assert.match(out, /plüg\.txt \| new file, 1 lines/);
	assert.doesNotMatch(out, /No such file/);
	assert.doesNotMatch(out, /\\303/);
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

// An agent that runs this inherits the session's working directory, so a lead
// reviewing a change in another checkout gets its own tree back unless the
// repository it names outranks that directory.
test("the repository named is the one diffed, whatever repository the cwd is in", () => {
	const reviewed = repository();
	const session = repository();
	writeFileSync(join(reviewed, "module.txt"), "alpha\n");
	writeFileSync(join(session, "elsewhere.txt"), "beta\n");

	const out = scope(reviewed, "", session);

	assert.match(out, /module\.txt \| new file, 1 lines/);
	assert.match(out, /\+alpha/);
	assert.doesNotMatch(out, /elsewhere\.txt/);
	assert.doesNotMatch(out, /\+beta/);
});

test("a repository the script is given nothing for names no tree to diff", () => {
	const out = scope("", "", repository());

	assert.match(out, /first argument/);
	assert.doesNotMatch(out, /Status:/);
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

/**
 * Stages everything in `repo` and returns the index written as a tree, the
 * snapshot a review-and-fix run takes as `since`.
 */
function snapshot(repo: string): string {
	git(repo, "add", "-A");
	return git(repo, "write-tree").trim();
}

// module.txt changed before the snapshot; see the status comment in
// scripts/diff-scope.sh for why it stays out.
test("against a snapshot, a file unchanged since is not listed in the status", () => {
	const cwd = repository();
	writeFileSync(join(cwd, "module.txt"), "alpha\n");
	writeFileSync(join(cwd, "other.txt"), "x\n");
	const since = snapshot(cwd);
	writeFileSync(join(cwd, "other.txt"), "x\ny\n");
	writeFileSync(join(cwd, "fresh.txt"), "fresh\n");

	const out = scope(cwd, since);

	assert.match(out, /Status:\n```\nM\tother\.txt\n\?\? fresh\.txt\n```/);
	assert.match(out, /\+y/);
	assert.match(out, /\+fresh/);
	assert.doesNotMatch(out, /module\.txt/);
});

// A reviewer past the inline ceiling runs the per-file commands from wherever
// it stands, so those commands name the reviewed repository rather than the
// cwd.
test("overflow suggestions name the reviewed repository in per-file commands", () => {
	const reviewed = repository();
	const session = repository();
	// Past the script's 26000-character budget, so the diff is not inlined.
	const large = "x".repeat(30000);
	writeFileSync(join(reviewed, "large.txt"), large);

	const out = scope(reviewed, "", session);

	const root = out.match(/Repository: (.+)/)?.[1];
	assert(root);
	assert(out.includes(`git -C ${root} diff HEAD -- <path>`));
	assert(out.includes(`${root}/<path>`));
	assert.doesNotMatch(out, /The diff is empty/);
});
