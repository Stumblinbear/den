// A structural diff as a page's hunks: the lines of a file's two versions
// that the diff paired, and the byte ranges it marked changed on them, cut
// into rows and hunks as a line diff's are.
import type { Hunk, Span, SyntaxLine } from "./git-diff.mts";

/** A span of one line's bytes the diff marked changed, end exclusive. */
export interface Range {
	readonly start: number;
	readonly end: number;
}

/**
 * What a structural diff said of a changed file: its lines paired, 0-based
 * and `null` on the side a line is not on, in the order both sides run, and
 * the ranges it marked changed on each side's lines, by line.
 */
export interface Alignment {
	readonly pairs: readonly (readonly [number | null, number | null])[];
	readonly old: ReadonlyMap<number, readonly Range[]>;
	readonly now: ReadonlyMap<number, readonly Range[]>;
}

/**
 * A row of the whole file, in the alignment's order: a pair kept, or a pair
 * or single line with a change, whose lines are its removed side's and its
 * added side's.
 */
type Row =
	| { readonly changed: false; readonly line: SyntaxLine }
	| { readonly changed: true; readonly lines: readonly SyntaxLine[] };

/**
 * A text's lines, each with any `\r` ending it. A newline ending the text
 * starts no line, though a diff may pair the empty string after it as one.
 */
function linesOf(text: string): string[] {
	const lines = text.split("\n");

	if (text.endsWith("\n")) {
		lines.pop();
	}

	return text === "" ? [] : lines;
}

/** A line of one side: its 1-based number, its text and what was marked on it. */
interface SideLine {
	readonly number: number;
	readonly text: string;
	readonly ranges: readonly Range[];
}

/**
 * Line `index` of `lines`, `null` where the pair has none on this side or
 * names the empty string past a final newline, and `undefined` for an
 * index past that, which no text has.
 */
function sideLine(
	lines: readonly string[],
	index: number | null,
	marked: ReadonlyMap<number, readonly Range[]>,
): SideLine | null | undefined {
	if (index === null || index === lines.length) {
		return null;
	}

	const text = lines[index];

	return text === undefined
		? undefined
		: { number: index + 1, text, ranges: marked.get(index) ?? [] };
}

// A UTF-8 continuation byte, which no character starts with.
const isContinuation = (byte: number | undefined): boolean =>
	byte !== undefined && (byte & 0xc0) === 0x80;

// Whether `bytes` from `start` to `end` are only spaces and tabs.
const isBlank = (bytes: Buffer, start: number, end: number): boolean =>
	bytes.subarray(start, end).every((byte) => byte === 0x20 || byte === 0x09);

/**
 * A line's text as spans, its marked byte ranges `kind` and the rest kept,
 * without the `\r` of a CRLF line end. Ranges that overlap, touch or stand
 * apart by only spaces and tabs are one span, so a changed run of words
 * reads as one. A range past the line, or with an end inside a character,
 * is not the byte offsets these are read as, and gives `null`.
 */
function spansOf(side: SideLine, kind: "add" | "del"): Span[] | null {
	const cr = side.text.endsWith("\r");
	const bytes = Buffer.from(cr ? side.text.slice(0, -1) : side.text, "utf8");
	const merged: { start: number; end: number }[] = [];

	for (const range of side.ranges.toSorted((a, b) => a.start - b.start)) {
		const last = merged.at(-1);

		if (
			range.end > bytes.length + (cr ? 1 : 0) ||
			isContinuation(bytes[range.start]) ||
			isContinuation(bytes[range.end])
		) {
			return null;
		}

		if (range.end === range.start) {
			continue;
		}

		if (last !== undefined && isBlank(bytes, last.end, range.start)) {
			last.end = Math.max(last.end, range.end);
		} else {
			merged.push({ ...range });
		}
	}

	const spans: Span[] = [];
	let at = 0;

	for (const { start, end } of merged) {
		const stop = Math.min(end, bytes.length);

		if (start > at) {
			spans.push({ kind: "ctx", text: bytes.toString("utf8", at, start) });
		}

		if (stop > start) {
			spans.push({ kind, text: bytes.toString("utf8", start, stop) });
		}

		at = stop;
	}

	if (at < bytes.length) {
		spans.push({ kind: "ctx", text: bytes.toString("utf8", at) });
	}

	return spans;
}

/**
 * The rows of the whole file. A pair with nothing marked on either side is
 * kept, shown as the new side has it: the diff matched every token on
 * it, even where the two lines are laid out differently. Any other pair,
 * and a line on one side only, is a change, its sides removed and added.
 */
function rowsOf(
	alignment: Alignment,
	oldText: string,
	newText: string,
): Row[] | null {
	const oldLines = linesOf(oldText);
	const newLines = linesOf(newText);
	const rows: Row[] = [];

	for (const [l, r] of alignment.pairs) {
		const before = sideLine(oldLines, l, alignment.old);
		const after = sideLine(newLines, r, alignment.now);

		if (before === undefined || after === undefined) {
			return null;
		}

		if (
			before !== null &&
			after !== null &&
			before.ranges.length === 0 &&
			after.ranges.length === 0
		) {
			rows.push({
				changed: false,
				line: {
					kind: "ctx",
					old: before.number,
					new: after.number,
					text: after.text.replace(/\r$/, ""),
				},
			});
			continue;
		}

		const removed = before === null ? [] : spansOf(before, "del");
		const added = after === null ? [] : spansOf(after, "add");

		if (removed === null || added === null) {
			return null;
		}

		const lines: SyntaxLine[] = [
			...(before === null
				? []
				: [{ kind: "del", old: before.number, spans: removed } as const]),
			...(after === null
				? []
				: [{ kind: "add", new: after.number, spans: added } as const]),
		];

		if (lines.length > 0) {
			rows.push({ changed: true, lines });
		}
	}

	return rows;
}

const rowLines = (row: Row): readonly SyntaxLine[] =>
	row.changed ? row.lines : [row.line];

const oldNumber = (line: SyntaxLine): number[] =>
	line.kind === "add" ? [] : [line.old];

const newNumber = (line: SyntaxLine): number[] =>
	line.kind === "del" ? [] : [line.new];

/** A run of changed rows' lines, the removed ones first. */
const inOrder = (run: readonly SyntaxLine[]): SyntaxLine[] => [
	...run.filter((line) => line.kind === "del"),
	...run.filter((line) => line.kind === "add"),
];

/**
 * `rows` as hunks, each change with `context` rows either side of it, and
 * two changes closer than twice that in one hunk, as git cuts a line diff.
 * A run of changed rows shows every removed line, then every added one, as
 * a line diff does. A hunk starts, on each side, at the number after the
 * last one the rows before it hold.
 */
function hunksOf(rows: readonly Row[], context: number): Hunk<SyntaxLine>[] {
	const windows: { from: number; to: number }[] = [];

	rows.forEach((row, i) => {
		if (!row.changed) {
			return;
		}

		const last = windows.at(-1);
		const from = Math.max(0, i - context);
		const to = Math.min(rows.length - 1, i + context);

		if (last !== undefined && from <= last.to + 1) {
			last.to = to;
		} else {
			windows.push({ from, to });
		}
	});

	return windows.map(({ from, to }) => {
		const before = rows.slice(0, from).flatMap(rowLines);
		const lines: SyntaxLine[] = [];
		let run: SyntaxLine[] = [];

		for (const row of rows.slice(from, to + 1)) {
			if (row.changed) {
				run.push(...row.lines);
				continue;
			}

			lines.push(...inOrder(run), row.line);
			run = [];
		}

		lines.push(...inOrder(run));

		return {
			oldStart: 1 + Math.max(0, ...before.flatMap(oldNumber)),
			newStart: 1 + Math.max(0, ...before.flatMap(newNumber)),
			context: "",
			lines,
		};
	});
}

/**
 * `alignment` of the file whose versions are `oldText` and `newText` as
 * hunks, each keeping `context` rows around a change. `null` where the
 * alignment names a line past either text or a range past its line or
 * inside a character, which is not the alignment of these texts, or pairs
 * no change.
 */
export function syntaxHunks(
	alignment: Alignment,
	oldText: string,
	newText: string,
	context: number,
): Hunk<SyntaxLine>[] | null {
	const rows = rowsOf(alignment, oldText, newText);

	return rows === null || !rows.some((row) => row.changed)
		? null
		: hunksOf(rows, context);
}
