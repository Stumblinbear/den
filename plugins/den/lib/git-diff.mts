// A git diff, parsed: the files a line diff or a porcelain word diff holds,
// their hunks, and what each line or run of words in them was.

/** Whether a diff added, removed or kept a piece of text. */
export type Kind = "add" | "del" | "ctx";

/**
 * A piece of text and what the diff did to it: a whole line in a line diff,
 * a run of words in a word diff.
 */
export interface Span {
	readonly kind: Kind;
	readonly text: string;
}

/** One `@@` hunk, its lines a line diff's spans or a word diff's lines. */
export interface Hunk<L> {
	readonly oldStart: number;
	readonly newStart: number;
	readonly context: string;
	readonly lines: L[];
}

/**
 * A line of a word diff: the spans between two of its line breaks. A break
 * is a newline of the old side or of the new one, and the porcelain format
 * does not say which, so a prose line carries no line number (see
 * `parseWordDiff`).
 */
export type ProseLine = readonly Span[];

/** What a file's section shows. */
export type Body =
	| { readonly kind: "lines"; readonly hunks: readonly Hunk<Span>[] }
	| { readonly kind: "words"; readonly hunks: readonly Hunk<ProseLine>[] }
	/** The file changed, but only in whitespace, which the diff ignored. */
	| { readonly kind: "whitespace" };

export interface DiffFile {
	readonly path: string;
	/** Whether the diff added or deleted the file whole, or changed it. */
	readonly change: "added" | "deleted" | "modified";
	readonly body: Body;
	/** Lines the line diff added and removed. */
	readonly added: number;
	readonly removed: number;
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/;
const FILE = /^diff --git a\/(.*) b\/(.*)$/;
const PREAMBLE =
	/^(index |--- |\+\+\+ |new file|deleted file|similarity|rename |old mode|new mode|Binary files)/;

/** A file out of a diff, each hunk's lines as git wrote them. */
interface RawFile {
	readonly path: string;
	change: DiffFile["change"];
	readonly hunks: Hunk<string>[];
}

/**
 * Files and hunks out of `git diff` text, line or word diff alike. Lines
 * before the first hunk of a file (the index line, the mode lines, the
 * `---`/`+++` pair) are the header and carry no content but whether the
 * file was added or deleted whole; `\ No newline at end of file` is dropped.
 *
 * A header is only read before a file's first `@@`: git writes none after
 * one, and a line the file deleted is not distinguishable from one, since
 * a removed `-- ` comment arrives as `--- `.
 */
function splitDiff(text: string): RawFile[] {
	const files: RawFile[] = [];
	let file: RawFile | null = null;

	for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
		const named = FILE.exec(raw);

		if (named !== null) {
			file = { path: named[2] ?? "", change: "modified", hunks: [] };
			files.push(file);
			continue;
		}

		if (file === null || (file.hunks.length === 0 && PREAMBLE.test(raw))) {
			if (file !== null && raw.startsWith("new file")) {
				file.change = "added";
			} else if (file !== null && raw.startsWith("deleted file")) {
				file.change = "deleted";
			}

			continue;
		}

		const hunk = HUNK.exec(raw);

		if (hunk !== null) {
			file.hunks.push({
				oldStart: Number(hunk[1]),
				newStart: Number(hunk[2]),
				context: (hunk[3] ?? "").trim(),
				lines: [],
			});
			continue;
		}

		const current = file.hunks.at(-1);

		// The newline ending the diff splits into a last empty string, which is
		// no line at all: git writes a space for a context line that is empty.
		if (
			current === undefined ||
			raw === "" ||
			raw.startsWith("\\ No newline")
		) {
			continue;
		}

		current.lines.push(raw);
	}

	return files;
}

/** What a line's first character, or a word run's, says the diff did. */
const kindOf = (mark: string | undefined): Kind =>
	mark === "+" ? "add" : mark === "-" ? "del" : "ctx";

/** Files and their line hunks out of a line diff. */
export function parseDiff(text: string): DiffFile[] {
	return splitDiff(text).map((file) => {
		let added = 0;
		let removed = 0;
		const hunks = file.hunks.map((hunk) => ({
			...hunk,
			lines: hunk.lines.map((raw): Span => {
				const kind = kindOf(raw[0]);

				added += kind === "add" ? 1 : 0;
				removed += kind === "del" ? 1 : 0;

				return { kind, text: raw.slice(1) };
			}),
		}));

		return {
			path: file.path,
			change: file.change,
			body: { kind: "lines", hunks },
			added,
			removed,
		};
	});
}

/**
 * Each file's hunks out of a `--word-diff=porcelain` diff, by path. Git
 * writes one run of words per line, marked `+`, `-` or ` ` as a line
 * diff marks lines, and a line holding only `~` for a newline.
 *
 * Neither side's lines can be counted from it. Kept text is written as the
 * new file has it, so the old file's newlines between kept words are not
 * written at all. A `~` inside a run of removed words is the old file's
 * newline and elsewhere the new file's, except where a change only removes
 * lines: git then writes the removed lines' own newlines after the last
 * removed word, where a newline of the new file could equally stand. The
 * lines here so break at every `~`, either side's, and carry no numbers.
 */
export function parseWordDiff(
	text: string,
): ReadonlyMap<string, Hunk<ProseLine>[]> {
	const files = new Map<string, Hunk<ProseLine>[]>();

	for (const file of splitDiff(text)) {
		files.set(
			file.path,
			file.hunks.map((hunk) => {
				const lines: ProseLine[] = [];
				let line: Span[] = [];

				for (const raw of hunk.lines) {
					if (raw === "~") {
						lines.push(line);
						line = [];
					} else if (raw.length > 1) {
						line.push({ kind: kindOf(raw[0]), text: raw.slice(1) });
					}
				}

				if (line.length > 0) {
					lines.push(line);
				}

				return { ...hunk, lines };
			}),
		);
	}

	return files;
}
