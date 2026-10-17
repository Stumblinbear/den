// The plan page's diff parser: `diffRows` reads a unified patch into the rows
// the page shows, `splitLines` splits text into lines, and
// `DIFF_PARSER_SCRIPT` carries both into the page.

/**
 * One line of a patch, as the plan page shows it.
 *
 * @remarks
 * `kind` says what the line is: `file` a file's name, `hunk` a hunk header,
 * `note` a `\` line such as "No newline at end of file", and `added`,
 * `removed` and `context` a hunk's lines.
 */
export type DiffRow =
	// viewer.html gives each line its `kind` as a CSS class and styles it by
	// that name.
	| { readonly kind: "file" | "hunk" | "note"; readonly text: string }
	| {
			readonly kind: "added" | "removed" | "context";
			readonly text: string;
			/**
			 * The line's number in the old file; undefined on an added line and
			 * where no hunk header numbered the lines.
			 */
			readonly oldLine: number | undefined;
			/**
			 * The line's number in the new file; undefined on a removed line and
			 * where no hunk header numbered the lines.
			 */
			readonly newLine: number | undefined;
	  };

/** A patch, read into the rows the page shows. */
export interface DiffParse {
	readonly rows: DiffRow[];
	/**
	 * The new name of each file the patch adds or changes, in order; a deleted
	 * file has none.
	 */
	readonly files: string[];
	/** Whether any hunk header numbered the lines. */
	readonly numbered: boolean;
}

// The page inlines splitLines and diffRows by their source text, as
// DIFF_PARSER_SCRIPT, so they reference only their arguments, globals and
// each other; anything else in this module is undefined in the page.

/**
 * Splits `text` at any line ending, dropping the empty line a final one
 * leaves.
 */
export function splitLines(text: string): string[] {
	return String(text).replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
}

/**
 * Reads `patch`, a unified diff of one file or more, into the rows the page
 * shows.
 *
 * @remarks
 * It reads `git diff` output and plain `diff -u` output, and never trusts the
 * line counts in `@@` headers, which hand-written patches get wrong. A hunk
 * holding a `--- ` line, a `+++ ` line and an `@@` header in a row is read as
 * the next file's headers, though a hunk all but never holds that run.
 */
export function diffRows(patch: string): DiffParse {
	const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/;
	const headers =
		/^(index |--- |new file mode|deleted file mode|similarity index|rename (from|to) )/;
	const lines = splitLines(patch);
	const rows: DiffRow[] = [];
	const files: string[] = [];
	let oldLine: number | undefined;
	let newLine: number | undefined;
	let numbered = false;
	let inHeaders = true;

	for (const [i, line] of lines.entries()) {
		if (line.startsWith("diff --git")) {
			inHeaders = true;
			continue;
		}

		// A `--- ` line opens a plain `diff -u` file's headers only right before
		// `+++ ` and an `@@` header, since a removed `-- x` is written `--- x`
		// too. Reading that run, not the `@@` header's line counts, finds the
		// next file in a hand-written patch whose counts are wrong.
		if (
			line.startsWith("--- ") &&
			(lines[i + 1] ?? "").startsWith("+++ ") &&
			hunk.test(lines[i + 2] ?? "")
		) {
			inHeaders = true;
		}

		if (inHeaders && headers.test(line)) {
			continue;
		}

		if (inHeaders && line.startsWith("+++ ")) {
			const file = line.slice(4).replace(/^b\//, "");

			if (file !== "/dev/null") {
				files.push(file);
				rows.push({ kind: "file", text: file });
			}

			continue;
		}

		const header = line.match(hunk);

		if (header !== null) {
			oldLine = Number(header[1]);
			newLine = Number(header[2]);
			numbered = true;
			inHeaders = false;
			rows.push({ kind: "hunk", text: `⋯ ${header[3] ?? ""}` });
			continue;
		}

		const first = line.charAt(0);

		if (first === "+") {
			rows.push({
				kind: "added",
				text: line,
				oldLine: undefined,
				newLine: newLine === undefined ? undefined : newLine++,
			});
		} else if (first === "-") {
			rows.push({
				kind: "removed",
				text: line,
				oldLine: oldLine === undefined ? undefined : oldLine++,
				newLine: undefined,
			});
		} else if (first === "\\") {
			rows.push({ kind: "note", text: line });
		} else {
			rows.push({
				kind: "context",
				text: line,
				oldLine: oldLine === undefined ? undefined : oldLine++,
				newLine: newLine === undefined ? undefined : newLine++,
			});
		}
	}

	return { rows, files, numbered };
}

/**
 * A classic script declaring `splitLines` and `diffRows`, for the page to
 * inline ahead of its own script.
 */
export const DIFF_PARSER_SCRIPT = `"use strict";\n${[splitLines, diffRows].map(String).join("\n\n")}\n`;
