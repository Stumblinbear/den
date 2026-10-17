// What the diff-page skill's preamble runs: the change as `git diff` renders
// it, written out as a page under `<os temp dir>/claude-den-diff-pages/`, and
// one line naming the file. The argument is the skill's whole argument string
// as one word, the contract diff-scope.sh takes: `readRange` splits it back
// into `git diff` arguments, and naming no revision means HEAD.
//
// Outside a repository, or when the diff fails, the reason is printed and
// the exit is 0, so the skill's preamble renders the reason rather than an
// error the session cannot read.
import { writeFileSync } from "node:fs";
import { basename } from "node:path";
import process from "node:process";
import { fileCount, renderPage } from "../lib/diff-page.mts";
import { readRange } from "../lib/diff-range.mts";
import { stampedTempFile } from "../lib/stamped-temp-file.mts";

/** The directory under the OS temp directory that pages go in. */
const PAGES_DIR = "claude-den-diff-pages";

function main(): string {
	const read = readRange(process.argv.slice(2).join(" "));

	if ("failure" in read) {
		return read.failure;
	}

	const { root, range, files } = read;

	if (files.length === 0) {
		return "The diff is empty.";
	}

	const path = stampedTempFile(PAGES_DIR, basename(root), "html");
	const added = files.reduce((sum, file) => sum + file.added, 0);
	const removed = files.reduce((sum, file) => sum + file.removed, 0);

	writeFileSync(
		path,
		renderPage(files, { title: `${basename(root)} diff`, range }),
	);

	return `Diff page: ${path} (git diff ${range}; ${fileCount(files.length)}, +${added} −${removed})`;
}

process.stdout.write(`${main()}\n`);
