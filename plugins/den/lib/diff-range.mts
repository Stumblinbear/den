// The files a `git diff` range changed, read from git: the tracked files'
// diff, the untracked files as the new-file diffs they become, a section for
// each file whose only change is whitespace, and each prose file's word diff.
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import process from "node:process";
import { type DiffArgs, diffArgs } from "./diff-args.mts";
import { type DiffFile, parseDiff, parseWordDiff } from "./git-diff.mts";

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

// The parser reads the `a/`-and-`b/` header git writes by default, which
// `diff.noprefix` and `diff.mnemonicPrefix` in the user's config replace, so
// every diff names the prefixes it is read with.
const DIFF = [
	"diff",
	"--no-color",
	"--no-ext-diff",
	"--src-prefix=a/",
	"--dst-prefix=b/",
];

// git's own options for the whitespace a diff ignores. With none of them in
// the argument the diff ignores all whitespace, as `-w` does, so a line
// reindented or rewrapped is not read as changed; with one, the caller's
// option is the only one.
const WHITESPACE = new Set([
	"-w",
	"--ignore-all-space",
	"-b",
	"--ignore-space-change",
	"--ignore-space-at-eol",
	"--ignore-cr-at-eol",
	"--ignore-blank-lines",
]);

// What turns a diff into the word diff a prose file is shown with.
const WORDS = ["--word-diff=porcelain"];

// The extensions of prose, which the page shows word by word, since a line
// diff of a rewrapped paragraph is one block removed and one added.
const PROSE = /\.(md|markdown|txt|rst|adoc)$/i;

const isProse = (path: string): boolean => PROSE.test(path);

/** What a git run printed, or the line saying why it failed. */
type Output = { readonly out: string } | { readonly failure: string };

/** A listing of paths, or the line saying why it failed. */
type Names =
	| { readonly names: readonly string[] }
	| { readonly failure: string };

/** The files a range changed, or the line saying why there are none. */
type Files = { readonly files: DiffFile[] } | { readonly failure: string };

/** A range read: its repository's root, the range as run, and its files. */
export type Range =
	| {
			readonly root: string;
			readonly range: string;
			readonly files: DiffFile[];
	  }
	| { readonly failure: string };

/**
 * Why a run gave no diff. A run that did not start, or was killed (past
 * `maxBuffer`, say), carries the cause in `error` and has no stderr; a run
 * that failed carries it in stderr.
 */
const reason = (run: SpawnSyncReturns<string>): string =>
	run.error?.message ?? run.stderr.trim();

/** Runs git where this process runs, `command` naming it in a failure. */
function git(args: readonly string[], command: string): Output {
	const run = spawnSync("git", args, RUN);

	return run.status === 0
		? { out: run.stdout }
		: { failure: `\`${command}\` failed: ${reason(run)}` };
}

/** The paths a `-z` listing printed, one per NUL-ended entry. */
function names(output: Output): Names {
	return "failure" in output
		? output
		: { names: output.out.split("\0").filter((name) => name !== "") };
}

/** The tracked files' diff, `extra` choosing its format. */
function trackedDiff(args: DiffArgs, extra: readonly string[]): Output {
	const whitespace = args.options.some((option) => WHITESPACE.has(option))
		? []
		: ["-w"];

	return git(
		[
			...DIFF,
			...whitespace,
			"--diff-algorithm=histogram",
			...extra,
			...args.words,
		],
		`git diff ${args.words.join(" ")}`,
	);
}

/**
 * Every tracked file the range changed, whitespace or not: `--name-only`
 * lists a file whose only change is whitespace, which the diff leaves out.
 */
const changedNames = (args: DiffArgs): Names =>
	names(
		git(
			["diff", "--name-only", "-z", ...args.words],
			`git diff --name-only ${args.words.join(" ")}`,
		),
	);

/**
 * Untracked, non-ignored files: `git diff` never shows a file outside the
 * index, and a new module is the part of a change a reader has to see. Only
 * a range that compares against the working tree has them; two revisions
 * hold no working tree.
 */
function untrackedNames(args: DiffArgs): Names {
	const twoSided =
		args.revisions.length > 1 ||
		args.revisions.some((rev) => rev.includes("..")) ||
		args.options.some(
			(option) => option === "--cached" || option === "--staged",
		);

	if (twoSided) {
		return { names: [] };
	}

	// A pathspec is relative to the working directory, which is where git
	// read the tracked diff's; `--full-name` keeps the listing root-relative
	// for the spawns in `newFileDiffs`, which run at the root.
	const pathspec = args.paths.length === 0 ? [":/"] : args.paths;

	return names(
		git(
			[
				"ls-files",
				"--others",
				"--exclude-standard",
				"--full-name",
				"-z",
				"--",
				...pathspec,
			],
			"git ls-files",
		),
	);
}

/**
 * Each of `files`, root-relative, as the new-file diff it becomes once
 * added, `extra` choosing its format.
 */
function newFileDiffs(
	root: string,
	files: readonly string[],
	extra: readonly string[],
): string {
	const diffs: string[] = [];

	for (const file of files) {
		// --no-index exits 1 whenever the file has content, the normal case, so
		// the status is not an error here. git takes the literal name
		// `/dev/null` as the empty side on every platform.
		const run = spawnSync(
			"git",
			[...DIFF, ...extra, "--no-index", "--", "/dev/null", file],
			{ cwd: root, ...RUN },
		);

		if (run.stdout !== "") {
			diffs.push(run.stdout);
		}
	}

	return diffs.join("");
}

/**
 * `files` and, after them, a section for each changed file the diff left
 * out, whose only change is whitespace the diff ignored.
 */
function withWhitespaceOnly(
	files: readonly DiffFile[],
	changed: readonly string[],
): DiffFile[] {
	const shown = new Set(files.map((file) => file.path));
	const hidden = changed
		.filter((path) => !shown.has(path))
		.map(
			(path): DiffFile => ({
				path,
				change: "modified",
				body: { kind: "whitespace" },
				added: 0,
				removed: 0,
			}),
		);

	return [...files, ...hidden];
}

/**
 * `files` with each prose file's lines replaced by the same range's word
 * diff of it, so a rewrapped paragraph or a changed word reads as what it
 * is. The counts stay the line diff's.
 */
function withProse(
	root: string,
	args: DiffArgs,
	files: readonly DiffFile[],
	untracked: readonly string[],
): Files {
	const tracked = trackedDiff(args, WORDS);

	if ("failure" in tracked) {
		return tracked;
	}

	const prose = parseWordDiff(
		tracked.out + newFileDiffs(root, untracked.filter(isProse), WORDS),
	);

	return {
		files: files.map((file) => {
			const hunks = prose.get(file.path);

			return hunks === undefined || !isProse(file.path)
				? file
				: { ...file, body: { kind: "words", hunks } };
		}),
	};
}

function rangeFiles(root: string, args: DiffArgs): Files {
	const tracked = trackedDiff(args, []);
	const changed = changedNames(args);
	const untracked = untrackedNames(args);

	if ("failure" in tracked) {
		return tracked;
	}

	if ("failure" in changed) {
		return changed;
	}

	if ("failure" in untracked) {
		return untracked;
	}

	const files = withWhitespaceOnly(
		parseDiff(tracked.out + newFileDiffs(root, untracked.names, [])),
		changed.names,
	);

	return files.some((file) => file.body.kind === "lines" && isProse(file.path))
		? withProse(root, args, files, untracked.names)
		: { files };
}

/** The files the range `argument` names changed, in the working directory's repository. */
export function readRange(argument: string): Range {
	const args = diffArgs(argument);
	const root = spawnSync("git", ["rev-parse", "--show-toplevel"], RUN);

	if (root.status !== 0) {
		return { failure: `Not inside a git repository: ${reason(root)}` };
	}

	const top = root.stdout.trim();
	const read = rangeFiles(top, args);

	return "failure" in read
		? read
		: { root: top, range: args.words.join(" "), files: read.files };
}
