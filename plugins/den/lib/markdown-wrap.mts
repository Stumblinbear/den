// Markdown wrapping: `wrapMarkdown` breaks a markdown text's long prose lines
// at a width.

/**
 * Matches a line that opens a fenced code block, or may close one; group 1
 * is its run of backticks or tildes.
 */
export const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * A line that stays whole however long: a table row, a heading, or an
 * indented code line, which opens on four spaces or a tab and is no list item.
 */
const KEPT_WHOLE = /^\s*[|#]|^( {4}|\t)(?!\s*([-*+]|\d+[.)]) )/;

/** A prose line's leading indent, `>` quote marks and list marker. */
const PREFIX = /^(\s*(?:>\s?)*(?:[-*+]\s+|\d+[.)]\s+)?)/;

/**
 * Breaks `line` at spaces into lines of at most `width` characters.
 *
 * @remarks
 * The first line keeps the prefix; the rest hang under it, with any list
 * marker turned to spaces. A word longer than `width` takes a line to itself,
 * and a run of spaces between words becomes one.
 */
function wrapLine(line: string, width: number): string[] {
	const prefix = line.match(PREFIX)?.[1] ?? "";
	const hanging = prefix.replace(/[-*+]|\d+[.)]/, (marker) =>
		" ".repeat(marker.length),
	);
	const words = line.slice(prefix.length).split(/ +/).filter(Boolean);
	const lines: string[] = [];
	let current = prefix;
	let empty = true;

	for (const word of words) {
		if (!empty && current.length + 1 + word.length > width) {
			lines.push(current);
			current = hanging;
			empty = true;
		}

		current += empty ? word : ` ${word}`;
		empty = false;
	}

	lines.push(current);

	return lines;
}

/**
 * Splits `text` into lines, breaking every prose line longer than `width` at
 * spaces.
 *
 * @remarks
 * Fenced code, table rows, headings and indented code stay whole, since a
 * break there changes what the markdown says. A wrapped list item or quote
 * keeps its marker's indent, so it renders as the same item.
 */
export function wrapMarkdown(text: string, width: number): string[] {
	const lines: string[] = [];
	let fence: string | undefined;

	for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
		const run = line.match(FENCE)?.[1];

		if (fence !== undefined) {
			const closes =
				run !== undefined &&
				run[0] === fence[0] &&
				run.length >= fence.length &&
				line.trim() === run;

			if (closes) {
				fence = undefined;
			}

			lines.push(line);
		} else if (run !== undefined) {
			fence = run;
			lines.push(line);
		} else if (line.length <= width || KEPT_WHOLE.test(line)) {
			lines.push(line);
		} else {
			lines.push(...wrapLine(line, width));
		}
	}

	return lines;
}
