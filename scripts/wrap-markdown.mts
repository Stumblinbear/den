// Wraps the prose of the repository's Markdown files at 80 columns, and
// checks that it is wrapped. Only paragraphs and list items are reflowed:
// frontmatter, code, tables, headings, quotes, HTML and a skill's `!`
// preamble lines are left as they are.
//
//   node scripts/wrap-markdown.mts [files...]           wrap
//   node scripts/wrap-markdown.mts --check [files...]   list what is unwrapped and exit non-zero
//
// With no files, every tracked `.md` file is wrapped.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WIDTH = 80;

const FENCE = /^\s*(```|~~~)/;
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])(\s+)(?=\S)/;
const INDENTED_CODE = /^ {4,}\S/;

/** A line that is never part of a paragraph, and is copied as it is. */
function isVerbatim(line: string): boolean {
	const trimmed = line.trimStart();

	return (
		trimmed === "" ||
		trimmed.startsWith("#") ||
		trimmed.startsWith("|") ||
		trimmed.startsWith(">") ||
		trimmed.startsWith("<") ||
		trimmed.startsWith("!`") ||
		/^\[[^\]]+\]:\s/.test(trimmed) ||
		/^([-*_])(\s*\1){2,}\s*$/.test(trimmed)
	);
}

/** Whether `line` ends in a hard break, which wrapping keeps at the end. */
const hasHardBreak = (line: string): boolean =>
	/ {2}$/.test(line) || /\\$/.test(line);

/**
 * The words of `text`, keeping each inline code span whole, so a span with
 * spaces in it is never split across lines.
 */
function words(text: string): string[] {
	const result: string[] = [];
	let current = "";
	let tick = "";

	for (let i = 0; i < text.length; i++) {
		const ch = text[i] as string;

		if (ch === "`") {
			let run = "`";

			while (text[i + 1] === "`") {
				run += "`";
				i++;
			}

			current += run;

			if (tick === "") {
				tick = run;
			} else if (tick === run) {
				tick = "";
			}

			continue;
		}

		if (/\s/.test(ch) && tick === "") {
			if (current !== "") {
				result.push(current);
				current = "";
			}

			continue;
		}

		current += ch;
	}

	if (current !== "") {
		result.push(current);
	}

	return result;
}

/** `text` filled to `WIDTH`, its first line after `first`, the rest after `rest`. */
function fill(text: string, first: string, rest: string): string[] {
	const lines: string[] = [];
	let line = first;
	let empty = true;

	for (const word of words(text)) {
		if (!empty && line.length + 1 + word.length > WIDTH) {
			lines.push(line);
			line = rest + word;
		} else {
			line += (empty ? "" : " ") + word;
		}

		empty = false;
	}

	lines.push(line);

	return lines;
}

/** `source` with its paragraphs and list items wrapped. */
function wrapMarkdown(source: string): string {
	const input = source.split("\n");
	const output: string[] = [];
	const at = (n: number): string => input[n] ?? "";
	let i = 0;

	// Whether the last block was a list item, so that an indented paragraph
	// after a blank line continues that item rather than being indented code.
	let inList = false;

	if (at(0) === "---") {
		const end = input.indexOf("---", 1);

		if (end > 0) {
			output.push(...input.slice(0, end + 1));
			i = end + 1;
		}
	}

	while (i < input.length) {
		const line = at(i);
		const fence = line.match(FENCE);

		if (fence) {
			const marker = fence[1] as string;

			output.push(line);
			i++;

			while (i < input.length) {
				const inner = at(i);

				output.push(inner);
				i++;

				if (inner.trimStart().startsWith(marker)) {
					break;
				}
			}

			continue;
		}

		if (isVerbatim(line)) {
			if (line.trim() !== "") {
				inList = false;
			}

			output.push(line);
			i++;
			continue;
		}

		if (INDENTED_CODE.test(line) && !inList && at(i - 1).trim() === "") {
			while (i < input.length) {
				const inner = at(i);
				const blankBeforeCode =
					inner.trim() === "" && INDENTED_CODE.test(at(i + 1));

				if (!INDENTED_CODE.test(inner) && !blankBeforeCode) {
					break;
				}

				output.push(inner);
				i++;
			}

			continue;
		}

		// A paragraph or a list item: its first line, then every line that
		// continues it, up to a blank line, a new list item or a verbatim line.
		const item = line.match(LIST_ITEM);

		if (item) {
			inList = true;
		} else if (!/^\s/.test(line)) {
			inList = false;
		}

		const first = item ? item[0] : ((line.match(/^\s*/) ?? [""])[0] as string);
		const rest = item ? " ".repeat(item[0].length) : first;
		const parts = [line.slice(first.length)];

		i++;

		while (
			i < input.length &&
			!hasHardBreak(at(i - 1)) &&
			!isVerbatim(at(i)) &&
			!FENCE.test(at(i)) &&
			!LIST_ITEM.test(at(i))
		) {
			parts.push(at(i).trim());
			i++;
		}

		const last = parts[parts.length - 1] as string;
		let tail = "";

		if (last.endsWith("\\")) {
			tail = "\\";
		} else if (/ {2}$/.test(last)) {
			tail = "  ";
		}

		const text = parts.join(" ").slice(0, parts.join(" ").length - tail.length);

		output.push(...fill(text, first, rest));
		output[output.length - 1] += tail;
	}

	return output.join("\n");
}

function trackedMarkdown(): string[] {
	return execFileSync("git", ["ls-files", "-z", "--", "*.md"], {
		cwd: ROOT,
		encoding: "utf8",
	})
		.split("\0")
		.filter((file) => file !== "");
}

const args = process.argv.slice(2);
const check = args[0] === "--check";
const given = check ? args.slice(1) : args;
// A licence is third-party text, kept exactly as it was shipped.
const files = (given.length > 0 ? given : trackedMarkdown()).filter(
	(file) => file.endsWith(".md") && !/LICEN[CS]E/i.test(file),
);
const unwrapped: string[] = [];

for (const file of files) {
	const path = join(ROOT, file);
	const source = readFileSync(path, "utf8");
	const wrapped = wrapMarkdown(source);

	if (wrapped === source) {
		continue;
	}

	if (check) {
		unwrapped.push(file);
	} else {
		writeFileSync(path, wrapped);
	}
}

if (unwrapped.length > 0) {
	process.stderr.write(
		`Markdown not wrapped at ${WIDTH} columns; run \`npm run fix\`:\n${unwrapped.map((file) => `  ${file}`).join("\n")}\n`,
	);
	process.exit(1);
}
