// What the diff-page skill's preamble runs: the change as `git diff` renders
// it, written out as a page under `<os temp dir>/claude-den-diff-pages/`, and
// one line naming the file. The argument is the skill's whole argument string
// as one word, the contract diff-scope.sh takes: `readRange` splits it back
// into `git diff` arguments, and naming no revision means HEAD.
//
// Outside a repository, or when the diff fails, the reason is printed and
// the exit is 0, so the skill's preamble renders the reason rather than an
// error the session cannot read.
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import process from "node:process";
import { fileCount, renderPage } from "../lib/diff-page.mts";
import { readRange } from "../lib/diff-range.mts";

// Pages go beside the other den plugins' per-session files, under the OS
// temp directory, so a page outlives nothing it should not and needs no
// cleanup of its own.
const PAGES_DIR = "claude-den-diff-pages";

function pagePath(root: string): string {
	const stamp = new Date()
		.toISOString()
		.replace(/[:.]/g, "-")
		.replace("T", "-")
		.slice(0, 19);
	const dir = join(tmpdir(), PAGES_DIR);

	mkdirSync(dir, { recursive: true });

	return join(dir, `${basename(root)}-${stamp}.html`);
}

function main(): string {
	const read = readRange(process.argv.slice(2).join(" "));

	if ("failure" in read) {
		return read.failure;
	}

	const { root, range, files } = read;

	if (files.length === 0) {
		return "The diff is empty.";
	}

	const path = pagePath(root);
	const added = files.reduce((sum, file) => sum + file.added, 0);
	const removed = files.reduce((sum, file) => sum + file.removed, 0);

	writeFileSync(
		path,
		renderPage(files, { title: `${basename(root)} diff`, range }),
	);

	return `Diff page: ${path} (git diff ${range}; ${fileCount(files.length)}, +${added} −${removed})`;
}

process.stdout.write(`${main()}\n`);
