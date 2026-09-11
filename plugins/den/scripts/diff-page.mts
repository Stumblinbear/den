// What the diff-page skill's preamble runs: the change as `git diff` renders
// it, written out as a page under `<os temp dir>/claude-den-diff-pages/`, and
// one line naming the file. The argument is the skill's whole argument string
// as one word, the contract diff-scope.sh takes: it is split back into
// `git diff` arguments here, and none means HEAD.
//
// Outside a repository, or when the diff fails, the reason is printed and
// the exit is 0, so the skill's preamble renders the reason rather than an
// error the session cannot read.
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import process from "node:process";
import {
	type DiffFile,
	fileCount,
	parseDiff,
	renderPage,
} from "../lib/diff-page.mts";

// git prints a non-ASCII path quoted and escaped under the default
// core.quotePath, which names no file and drops the untracked hunk for it.
const GIT_ENV = {
	// biome-ignore lint/style/noProcessEnv: git needs the session's PATH and HOME; the three below are what this run adds.
	...process.env,
	GIT_CONFIG_COUNT: "1",
	GIT_CONFIG_KEY_0: "core.quotePath",
	GIT_CONFIG_VALUE_0: "false",
};

// A diff of any size is the point, so no call here keeps Node's 1 MiB
// default: past it the child is killed and `error` is set with no stderr,
// which reads as git failing for no reason.
const RUN = { encoding: "utf8", env: GIT_ENV, maxBuffer: Infinity } as const;

// Pages go beside the other den plugins' per-session files, under the OS
// temp directory, so a page outlives nothing it should not and needs no
// cleanup of its own.
const PAGES_DIR = "claude-den-diff-pages";

// The parser reads the `a/`-and-`b/` header git writes by default, which
// `diff.noprefix` and `diff.mnemonicPrefix` in the user's config replace, so
// both diffs name the prefixes they are read with.
const DIFF = [
	"diff",
	"--no-color",
	"--no-ext-diff",
	"--src-prefix=a/",
	"--dst-prefix=b/",
];

function diffArgs(): readonly string[] {
	const words = process.argv
		.slice(2)
		.join(" ")
		.trim()
		.split(/\s+/)
		.filter((w) => w !== "");

	return words.length === 0 ? ["HEAD"] : words;
}

/**
 * Why a run gave no diff. A run that did not start, or was killed (past
 * `maxBuffer`, say), carries the cause in `error` and has no stderr; a run
 * that failed carries it in stderr.
 */
const reason = (run: SpawnSyncReturns<string>): string =>
	run.error?.message ?? run.stderr.trim();

/** The untracked hunks, or why the listing that finds them failed. */
type Untracked = { hunks: string } | { failure: string };

/**
 * Untracked, non-ignored files, each as the new-file hunk it becomes once
 * added: `git diff` never shows a file outside the index, and a new module
 * is the part of a change a reader has to see. Only a range that compares
 * against the working tree has them; two revisions hold no working tree.
 */
function untrackedHunks(root: string, diffArgs: readonly string[]): Untracked {
	const dash = diffArgs.indexOf("--");
	const revs = dash === -1 ? diffArgs : diffArgs.slice(0, dash);
	const paths = dash === -1 ? [] : diffArgs.slice(dash + 1);
	const twoSided = revs.some(
		(rev) => rev.includes("..") || rev === "--cached" || rev === "--staged",
	);

	if (twoSided || revs.length > 1) {
		return { hunks: "" };
	}

	// A pathspec is relative to the working directory, which is where git
	// read the tracked diff's; `--full-name` keeps the listing root-relative
	// for the spawn below, which runs at the root.
	const listing = spawnSync(
		"git",
		[
			"ls-files",
			"--others",
			"--exclude-standard",
			"--full-name",
			"-z",
			"--",
			...(paths.length === 0 ? [":/"] : paths),
		],
		{ cwd: process.cwd(), ...RUN },
	);

	if (listing.status !== 0) {
		return { failure: reason(listing) };
	}

	const hunks: string[] = [];
	const names = listing.stdout.split("\0").filter((name) => name !== "");

	for (const file of names) {
		// --no-index exits 1 whenever the file has content, the normal case, so
		// the status is not an error here. git takes the literal name
		// `/dev/null` as the empty side on every platform.
		const run = spawnSync(
			"git",
			[...DIFF, "--no-index", "--", "/dev/null", file],
			{ cwd: root, ...RUN },
		);

		if (run.stdout !== "") {
			hunks.push(run.stdout);
		}
	}

	return { hunks: hunks.join("") };
}

function pagePath(root: string): string {
	const stamp = new Date()
		.toISOString()
		.replace(/[:.]/g, "-")
		.replace("T", "-")
		.slice(0, 19);
	const dir = join(tmpdir(), PAGES_DIR);

	mkdirSync(dir, { recursive: true });

	return join(dir, `${basename(root)}-${stamp}.html`);
}

function main(): string {
	const diff = diffArgs();
	const root = spawnSync("git", ["rev-parse", "--show-toplevel"], RUN);

	if (root.status !== 0) {
		return `Not inside a git repository: ${reason(root)}`;
	}

	const top = root.stdout.trim();
	const tracked = spawnSync(
		"git",
		[...DIFF, "--diff-algorithm=histogram", ...diff],
		RUN,
	);
	const range = diff.join(" ");

	if (tracked.status !== 0) {
		return `\`git diff ${range}\` failed: ${reason(tracked)}`;
	}

	const untracked = untrackedHunks(top, diff);

	if ("failure" in untracked) {
		return `\`git ls-files\` failed: ${untracked.failure}`;
	}

	const files: DiffFile[] = parseDiff(tracked.stdout + untracked.hunks);

	if (files.length === 0) {
		return "The diff is empty.";
	}

	const path = pagePath(top);
	const added = files.reduce((sum, file) => sum + file.added, 0);
	const removed = files.reduce((sum, file) => sum + file.removed, 0);

	writeFileSync(
		path,
		renderPage(files, { title: `${basename(top)} diff`, range }),
	);

	return `Diff page: ${path} (git diff ${range}; ${fileCount(files.length)}, +${added} −${removed})`;
}

process.stdout.write(`${main()}\n`);
