// Plan sources: `resolveSources` reads the files a plan's code and image
// blocks point at into the blocks, so a page carries every source and reads
// nothing once open. `UnreadSource` names one it could not read.
import { readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { git, type Output } from "../git-command.mts";
import { errorMessage, fieldsOf } from "../shared/fields.mts";
import { blocksOf } from "./parts.mts";

/** A file a code or image block points at that could not be read. */
export interface UnreadSource {
	/**
	 * Where the block points: its path with any line range and commit, or the
	 * block's kind where it names no path.
	 */
	readonly source: string;
	readonly reason: string;
}

type JsonObject = Record<string, unknown>;

/** What a read gave, or why it gave nothing. */
type Read<T> = { readonly resolved: T } | { readonly error: string };

/** A code block's `resolved`: its lines, and the first one's number. */
interface CodeText {
	readonly text: string;
	readonly firstLine: number;
}

/** An image block's `resolved`: the image as a `data:` URI. */
interface ImageSrc {
	readonly src: string;
}

const text = (value: unknown): string | undefined =>
	typeof value === "string" ? value : undefined;

/** The `data:` URI media type for each image extension a page shows. */
const IMAGE_TYPES: Readonly<Record<string, string>> = {
	".avif": "image/avif",
	".bmp": "image/bmp",
	".gif": "image/gif",
	".ico": "image/x-icon",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".png": "image/png",
	".svg": "image/svg+xml",
	".webp": "image/webp",
};

/**
 * The repository a plan's `gitPath`s are relative to: the one the plan file
 * sits in. Git is asked for its root once, when a block first needs it.
 */
class PlanRepo {
	readonly #dir: string;
	#root: Output | undefined;

	constructor(planFile: string) {
		this.#dir = dirname(planFile);
	}

	/** The repository's root directory, or why git found none. */
	root(): Read<string> {
		this.#root ??= git(
			["-C", this.#dir, "rev-parse", "--show-toplevel"],
			"git rev-parse --show-toplevel",
		);

		return "out" in this.#root
			? { resolved: this.#root.out.trim() }
			: { error: this.#root.failure };
	}

	/** The text of `gitPath` at `commit`, or why git could not show it. */
	show(gitPath: string, commit: string): Read<string> {
		const root = this.root();

		if ("error" in root) {
			return root;
		}

		const show = `${commit}:${gitPath}`;
		const output = git(["-C", root.resolved, "show", show], `git show ${show}`);

		return "out" in output
			? { resolved: output.out }
			: { error: output.failure };
	}

	/** `gitPath` as a path on disk, under the repository's root. */
	path(gitPath: string): Read<string> {
		const root = this.root();

		return "error" in root ? root : { resolved: join(root.resolved, gitPath) };
	}
}

function readText(path: string): Read<string> {
	try {
		return { resolved: readFileSync(path, "utf8") };
	} catch (error) {
		return { error: errorMessage(error) };
	}
}

/** `lines` as `[first, last]`, or undefined unless `1 <= first <= last`. */
function lineRange(lines: unknown): readonly [number, number] | undefined {
	if (!Array.isArray(lines) || lines.length !== 2) {
		return undefined;
	}

	const [first, last] = lines;

	return Number.isInteger(first) &&
		Number.isInteger(last) &&
		1 <= first &&
		first <= last
		? [first, last]
		: undefined;
}

/**
 * Lines `first` to `last` of `whole`, 1-based and inclusive, each with its
 * own line ending, so a range ending on a blank line ends in two. A range
 * running past the end fails, since it means the file changed under the plan.
 */
function slice(
	whole: string,
	[first, last]: readonly [number, number],
): Read<CodeText> {
	// A newline ending the file closes its last line and opens none.
	const lines = whole === "" ? [] : whole.split(/(?<=\n)/);

	if (last > lines.length) {
		return {
			error: `lines ${first}–${last} run past the end of the file, which has ${lines.length}`,
		};
	}

	return {
		resolved: {
			text: lines.slice(first - 1, last).join(""),
			firstLine: first,
		},
	};
}

/**
 * Names where a code block's `from` points, as {@link UnreadSource.source}
 * does: its path, any line range and any commit, or "a code block" where it
 * names no path.
 */
export function codeSource(from: JsonObject): string {
	const path =
		text(from["gitPath"]) ?? text(from["absolutePath"]) ?? "a code block";
	const range = lineRange(from["lines"]);
	const lines = range === undefined ? "" : `:${range[0]}–${range[1]}`;
	const commit = text(from["commit"]);

	return `${path}${lines}${commit === undefined ? "" : ` @ ${commit}`}`;
}

function readCode(from: JsonObject, repo: PlanRepo): Read<CodeText> {
	const range = lineRange(from["lines"]);

	if (range === undefined) {
		return { error: "`lines` is not a [first, last] range of line numbers" };
	}

	const gitPath = text(from["gitPath"]);
	const absolutePath = text(from["absolutePath"]);
	const commit = text(from["commit"]);
	let whole: Read<string>;

	if (gitPath !== undefined && commit !== undefined) {
		whole = repo.show(gitPath, commit);
	} else if (gitPath !== undefined) {
		const path = repo.path(gitPath);

		whole = "error" in path ? path : readText(path.resolved);
	} else if (absolutePath !== undefined) {
		whole = readText(absolutePath);
	} else {
		return { error: "`from` names no gitPath, absolutePath or text" };
	}

	return "error" in whole ? whole : slice(whole.resolved, range);
}

/**
 * An image block's file as a `data:` URI. An extension missing from
 * `IMAGE_TYPES` fails the block rather than going in untyped.
 */
function readImage(block: JsonObject, repo: PlanRepo): Read<ImageSrc> {
	const gitPath = text(block["gitPath"]);
	const absolutePath = text(block["absolutePath"]);
	const path =
		gitPath !== undefined
			? repo.path(gitPath)
			: absolutePath !== undefined
				? { resolved: absolutePath }
				: { error: "the block names no gitPath or absolutePath" };

	if ("error" in path) {
		return path;
	}

	const type = IMAGE_TYPES[extname(path.resolved).toLowerCase()];

	if (type === undefined) {
		return {
			error: `${extname(path.resolved) || "no extension"} is not an image type the page shows`,
		};
	}

	try {
		const data = readFileSync(path.resolved).toString("base64");

		return { resolved: { src: `data:${type};base64,${data}` } };
	} catch (error) {
		return { error: errorMessage(error) };
	}
}

/** Sets `block`'s `resolved` or `error` from `read`, and removes the other. */
function settle<T>(block: JsonObject, read: Read<T>): void {
	if ("error" in read) {
		block["error"] = read.error;
		delete block["resolved"];
	} else {
		block["resolved"] = read.resolved;
		delete block["error"];
	}
}

/**
 * Reads the file each code and image block in `plan` points at into the
 * block, and returns every source that could not be read.
 *
 * @remarks
 * Each `gitPath` in `plan` must use `/` as its separator, as
 * `normaliseGitPaths` leaves it, and is read relative to the repository
 * `planFile` sits in.
 *
 * `plan` is changed in place: a block that was read gets `resolved`, and one
 * that was not gets `error` with the reason, each in place of the other. A
 * code block whose `from` carries its own `text` is left as it is, and so are
 * an entry that is not an object and a block of another kind. Nothing is
 * written to disk.
 */
export function resolveSources(
	plan: Record<string, unknown>,
	planFile: string,
): UnreadSource[] {
	const repo = new PlanRepo(planFile);
	const unread: UnreadSource[] = [];

	for (const block of blocksOf(plan)) {
		let read: Read<unknown>;
		let source: string;

		if (block["kind"] === "code") {
			const from = fieldsOf(block["from"]);

			if (text(from["text"]) !== undefined) {
				continue;
			}

			read = readCode(from, repo);
			source = codeSource(from);
		} else if (block["kind"] === "image") {
			read = readImage(block, repo);
			source =
				text(block["gitPath"]) ??
				text(block["absolutePath"]) ??
				"an image block";
		} else {
			continue;
		}

		settle(block, read);

		if ("error" in read) {
			unread.push({ source, reason: read.error });
		}
	}

	return unread;
}
