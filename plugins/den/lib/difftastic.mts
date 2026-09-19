// A file's structural diff from difftastic: `difft` run on its two versions,
// and the JSON it prints read into the hunks a page's section shows.
//
// The JSON is marked unstable (`difft` prints it only with DFT_UNSTABLE=yes
// set, and says its format may change), so anything here that does not read
// as the shape difftastic 0.70 printed gives `null`, and the caller keeps the
// line diff: a format change degrades the page and never breaks it.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import process from "node:process";
import type { Body } from "./git-diff.mts";
import { type Alignment, type Range, syntaxHunks } from "./syntax-hunks.mts";

const DIFFT_ENV = {
	// biome-ignore lint/style/noProcessEnv: difft needs the session's PATH, and reads the user's DFT_ settings from it; the one below is what this run adds.
	...process.env,
	DFT_UNSTABLE: "yes",
};

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isIndex = (value: unknown): value is number =>
	typeof value === "number" && Number.isInteger(value) && value >= 0;

/** One side of a chunk entry, `{"line_number", "changes": [{"start", "end"}]}`, into `into`. */
function readSide(side: unknown, into: Map<number, Range[]>): boolean {
	if (side === undefined) {
		return true;
	}

	if (
		!isObject(side) ||
		!isIndex(side["line_number"]) ||
		!Array.isArray(side["changes"])
	) {
		return false;
	}

	const ranges = into.get(side["line_number"]) ?? [];

	for (const change of side["changes"]) {
		if (
			!isObject(change) ||
			!isIndex(change["start"]) ||
			!isIndex(change["end"]) ||
			change["end"] < change["start"]
		) {
			return false;
		}

		ranges.push({ start: change["start"], end: change["end"] });
	}

	into.set(side["line_number"], ranges);

	return true;
}

/**
 * The file difftastic's JSON for one file pair describes: `"unchanged"`,
 * what it paired and changed, or `null` for a status of neither, output
 * that is not the shape, or a diff it fell back to text for, whose
 * `language` then starts `Text` and whose changes are whole lines, which
 * the line diff shows as well with whitespace ignored.
 */
function readJson(json: string): "unchanged" | Alignment | null {
	let parsed: unknown;

	try {
		parsed = JSON.parse(json);
	} catch {
		return null;
	}

	if (
		!isObject(parsed) ||
		typeof parsed["language"] !== "string" ||
		parsed["language"].startsWith("Text")
	) {
		return null;
	}

	if (parsed["status"] === "unchanged") {
		return "unchanged";
	}

	const pairs = parsed["aligned_lines"];
	const chunks = parsed["chunks"];

	if (
		parsed["status"] !== "changed" ||
		!Array.isArray(pairs) ||
		!Array.isArray(chunks) ||
		!pairs.every(
			(pair) =>
				Array.isArray(pair) &&
				pair.length === 2 &&
				pair.every((line) => line === null || isIndex(line)),
		)
	) {
		return null;
	}

	const old = new Map<number, Range[]>();
	const now = new Map<number, Range[]>();
	const read = chunks.every(
		(chunk) =>
			Array.isArray(chunk) &&
			chunk.every(
				(entry) =>
					isObject(entry) &&
					readSide(entry["lhs"], old) &&
					readSide(entry["rhs"], now),
			),
	);

	return read ? { pairs, old, now } : null;
}

/**
 * The body difftastic's `json` for the file pair `oldText` and `newText`
 * gives, hunks keeping `context` rows around each change: the file's
 * syntax diff, or the note that only whitespace changed where difftastic
 * matched every token. `null` where the JSON does not read as difftastic's
 * or holds no change.
 */
export function syntaxBody(
	json: string,
	oldText: string,
	newText: string,
	context: number,
): Body | null {
	const read = readJson(json);

	if (read === "unchanged") {
		return { kind: "whitespace" };
	}

	const hunks =
		read === null ? null : syntaxHunks(read, oldText, newText, context);

	return hunks === null ? null : { kind: "syntax", hunks };
}

/**
 * `syntaxBody` of `difft` run on the two versions of the file at `path`,
 * each written under a temporary directory by the file's own name, which
 * difftastic picks the language by. `null` where `difft` is not installed
 * or fails, as for output it cannot read.
 */
export function difftasticBody(
	path: string,
	oldText: string,
	newText: string,
	context: number,
): Body | null {
	const dir = mkdtempSync(join(tmpdir(), "den-difft-"));
	const before = join(dir, "old", basename(path));
	const after = join(dir, "new", basename(path));

	try {
		mkdirSync(join(dir, "old"));
		mkdirSync(join(dir, "new"));
		writeFileSync(before, oldText);
		writeFileSync(after, newText);

		const run = spawnSync("difft", ["--display", "json", before, after], {
			encoding: "utf8",
			env: DIFFT_ENV,
			maxBuffer: Infinity,
		});

		return run.error === undefined && run.status === 0
			? syntaxBody(run.stdout, oldText, newText, context)
			: null;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}
