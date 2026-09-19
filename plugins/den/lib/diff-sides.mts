// The two versions of each file a `git diff` range changed, as the range
// names them: a revision's, the index's or the working tree's.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DiffArgs } from "./diff-args.mts";
import { git, RUN } from "./git-command.mts";

/** A changed file's text before the range and after it. */
export interface Sides {
	readonly old: string;
	readonly now: string;
}

/** Where a changed file's two versions are: blob ids, `null` for the working tree. */
interface Blobs {
	readonly old: string;
	readonly now: string | null;
}

// The id git's raw listing gives a side that is not in the object store,
// which is the working tree's file.
const WORKING_TREE = /^0+$/;

/**
 * The blobs of each file a `git diff --raw -z` listing names, by the path
 * the line diff names it by: the new one, for a rename or a copy. An entry
 * is `:<mode> <mode> <id> <id> <status>`, then its path, or its source and
 * destination for a status of `R` or `C`, each field NUL-ended.
 */
function rawBlobs(listing: string): Map<string, Blobs> {
	const fields = listing.split("\0");
	const blobs = new Map<string, Blobs>();
	let at = 0;

	while (at < fields.length) {
		const [, , old = "", now = "", status = ""] = (fields[at] ?? "")
			.slice(1)
			.split(" ");
		const twoPaths = status.startsWith("R") || status.startsWith("C");
		const path = fields[at + (twoPaths ? 2 : 1)];

		at += twoPaths ? 3 : 2;

		if (path !== undefined && path !== "") {
			blobs.set(path, { old, now: WORKING_TREE.test(now) ? null : now });
		}
	}

	return blobs;
}

/**
 * The text of each of `ids` from one `git cat-file --batch`, which prints
 * each object as `<id> <type> <size>`, a newline, `<size>` bytes and a
 * newline, or `<id> missing` and a newline. An object not printed whole is
 * left out.
 */
function blobTexts(root: string, ids: readonly string[]): Map<string, string> {
	const run = spawnSync("git", ["cat-file", "--batch"], {
		...RUN,
		cwd: root,
		encoding: "buffer",
		input: Buffer.from(ids.map((id) => `${id}\n`).join("")),
	});
	const texts = new Map<string, string>();

	if (run.status !== 0) {
		return texts;
	}

	const out = run.stdout;
	let at = 0;

	while (at < out.length) {
		const end = out.indexOf(0x0a, at);

		if (end === -1) {
			break;
		}

		const [id = "", , size] = out.toString("utf8", at, end).split(" ");

		at = end + 1;

		if (size === undefined) {
			continue;
		}

		const bytes = Number(size);

		if (!Number.isInteger(bytes) || at + bytes > out.length) {
			break;
		}

		texts.set(id, out.toString("utf8", at, at + bytes));
		at += bytes + 1;
	}

	return texts;
}

/**
 * Both versions of each of `paths`, root-relative, that the range `args`
 * changed. The range is listed where this process runs, which is where its
 * paths are relative to, as for the page's other diffs. A path whose
 * versions cannot be read is left out, and a failed listing leaves every
 * path out.
 */
export function readSides(
	root: string,
	args: DiffArgs,
	paths: readonly string[],
): ReadonlyMap<string, Sides> {
	const sides = new Map<string, Sides>();
	const listing = git(
		["diff", "--raw", "-z", "--no-abbrev", "--no-ext-diff", ...args.words],
		`git diff --raw ${args.words.join(" ")}`,
	);

	if ("failure" in listing) {
		return sides;
	}

	const blobs = rawBlobs(listing.out);
	const wanted = paths.flatMap((path) => {
		const found = blobs.get(path);

		return found === undefined ? [] : [{ path, ...found }];
	});
	const texts = blobTexts(
		root,
		wanted.flatMap(({ old, now }) => (now === null ? [old] : [old, now])),
	);

	for (const { path, old, now } of wanted) {
		const before = texts.get(old);
		const after = now === null ? workingText(root, path) : texts.get(now);

		if (before !== undefined && after !== undefined) {
			sides.set(path, { old: before, now: after });
		}
	}

	return sides;
}

/** The working tree's text of `path`, or `undefined` where it cannot be read. */
function workingText(root: string, path: string): string | undefined {
	try {
		return readFileSync(join(root, path), "utf8");
	} catch {
		return undefined;
	}
}
