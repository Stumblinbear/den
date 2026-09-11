// A unified diff as a page: the parser that turns `git diff` output into
// files and hunks, and the renderer that lays them out one collapsible
// section per file, with old and new line numbers, for reading a change on a
// phone. The page carries its own styles and loads two faces from Google
// Fonts with system fallbacks; nothing else reaches out.

export interface Line {
	readonly kind: "add" | "del" | "ctx";
	readonly text: string;
}

export interface Hunk {
	readonly oldStart: number;
	readonly newStart: number;
	readonly context: string;
	readonly lines: Line[];
}

export interface DiffFile {
	readonly path: string;
	readonly hunks: Hunk[];
	added: number;
	removed: number;
}

/** What the header line above the sections says. */
export interface PageHeading {
	readonly title: string;
	readonly range: string;
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/;
const FILE = /^diff --git a\/(.*) b\/(.*)$/;
const PREAMBLE =
	/^(index |--- |\+\+\+ |new file|deleted file|similarity|rename |old mode|new mode|Binary files)/;

/**
 * Files and hunks out of `git diff` text. Lines before the first hunk of a
 * file (the index line, the mode lines, the `---`/`+++` pair) are the
 * header and carry no content; `\ No newline at end of file` is dropped.
 *
 * A header is only read before a file's first `@@`: git writes none after
 * one, and a line the file deleted is not distinguishable from one, since
 * a removed `-- ` comment arrives as `--- `.
 */
export function parseDiff(text: string): DiffFile[] {
	const files: DiffFile[] = [];
	let file: DiffFile | null = null;

	for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
		const named = FILE.exec(raw);

		if (named !== null) {
			file = { path: named[2] ?? "", hunks: [], added: 0, removed: 0 };
			files.push(file);
			continue;
		}

		if (file === null || (file.hunks.length === 0 && PREAMBLE.test(raw))) {
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

		const mark = raw[0];
		const text = raw.slice(1);

		if (mark === "+") {
			current.lines.push({ kind: "add", text });
			file.added += 1;
		} else if (mark === "-") {
			current.lines.push({ kind: "del", text });
			file.removed += 1;
		} else {
			current.lines.push({ kind: "ctx", text });
		}
	}

	return files;
}

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/** How many files a diff holds, worded: "1 file", "2 files". */
export const fileCount = (count: number): string =>
	`${count} file${count === 1 ? "" : "s"}`;

const MONO = '"JetBrains Mono", ui-monospace, monospace';

export const CSS = `
:root {
  --bg:#F5F6F8; --panel:#FFFFFF; --ink:#1E2328; --mute:#5C6670; --rule:#D9DEE4;
  --accent:#1B6F6A; --add-bg:#E3F3E8; --add-ink:#1A6B3A; --del-bg:#FBE7E7; --del-ink:#9E2A2A;
  --hunk-bg:#EEF2F6; --hunk-ink:#4C6A8A; --ln:#9AA3AC;
}
@media (prefers-color-scheme: dark) { :root {
  --bg:#141719; --panel:#1B1F23; --ink:#E4E8EC; --mute:#98A2AD; --rule:#2C333A;
  --accent:#5FC3BC; --add-bg:#1B3323; --add-ink:#8FD9A6; --del-bg:#3D2023; --del-ink:#F19A9A;
  --hunk-bg:#20272F; --hunk-ink:#8FB3D9; --ln:#5E6973;
} }
body { background:var(--bg); color:var(--ink); font:15px/1.5 "IBM Plex Sans", system-ui, sans-serif; margin:0; }
header { padding:20px 16px 12px; border-bottom:1px solid var(--rule); background:var(--panel); }
header h1 { font-size:20px; font-weight:600; margin:0 0 4px; text-wrap:balance; }
header p { margin:0; color:var(--mute); font-size:14px; }
header code { font-family:${MONO}; font-size:13px; }
nav { padding:12px 16px; border-bottom:1px solid var(--rule); display:flex; flex-direction:column; gap:6px; }
nav a { display:flex; justify-content:space-between; gap:12px; text-decoration:none; color:var(--ink); font-family:${MONO}; font-size:12.5px; }
nav a .p { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
nav a .n { white-space:nowrap; font-variant-numeric:tabular-nums; }
.a { color:var(--add-ink); font-weight:500; } .d { color:var(--del-ink); font-weight:500; }
main { display:flex; flex-direction:column; gap:14px; padding:14px 0 40px; }
.file { background:var(--panel); border-top:1px solid var(--rule); border-bottom:1px solid var(--rule); }
.file summary { cursor:pointer; padding:10px 16px; display:flex; justify-content:space-between; gap:12px; align-items:baseline; list-style:none; position:sticky; top:0; background:var(--panel); border-bottom:1px solid var(--rule); }
.file summary::-webkit-details-marker { display:none; }
.file summary .path { font-family:${MONO}; font-size:13px; font-weight:500; color:var(--accent); word-break:break-all; }
.file summary .counts { white-space:nowrap; font-family:${MONO}; font-size:12.5px; display:flex; gap:8px; font-variant-numeric:tabular-nums; }
.file summary:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }
.scroll { overflow-x:auto; }
table { border-collapse:collapse; font-family:${MONO}; font-size:12.5px; line-height:1.45; min-width:100%; }
td { padding:0 8px; white-space:pre; vertical-align:top; }
td.ln { color:var(--ln); text-align:right; width:1%; user-select:none; font-variant-numeric:tabular-nums; padding-left:12px; }
td.c { width:100%; padding-right:16px; }
tr.add td { background:var(--add-bg); } tr.add td.c { color:var(--add-ink); }
tr.del td { background:var(--del-bg); } tr.del td.c { color:var(--del-ink); }
tr.h td { background:var(--hunk-bg); color:var(--hunk-ink); padding-top:4px; padding-bottom:4px; }
`;

const FONTS =
	"https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";

const counts = (file: DiffFile): string =>
	`<b class="a">+${file.added}</b> <b class="d">−${file.removed}</b>`;

function rows(file: DiffFile): string {
	const out: string[] = [];

	for (const hunk of file.hunks) {
		out.push(
			`<tr class="h"><td class="ln"></td><td class="ln"></td><td class="c">@@ −${hunk.oldStart} +${hunk.newStart} @@ ${escapeHtml(hunk.context)}</td></tr>`,
		);

		let old = hunk.oldStart;
		let now = hunk.newStart;

		for (const line of hunk.lines) {
			const text = escapeHtml(line.text);

			if (line.kind === "add") {
				out.push(
					`<tr class="add"><td class="ln"></td><td class="ln">${now}</td><td class="c">${text}</td></tr>`,
				);
				now += 1;
			} else if (line.kind === "del") {
				out.push(
					`<tr class="del"><td class="ln">${old}</td><td class="ln"></td><td class="c">${text}</td></tr>`,
				);
				old += 1;
			} else {
				out.push(
					`<tr><td class="ln">${old}</td><td class="ln">${now}</td><td class="c">${text}</td></tr>`,
				);
				old += 1;
				now += 1;
			}
		}
	}

	return out.join("");
}

/** The whole page, sections open, for `files` under `heading`. */
export function renderPage(
	files: readonly DiffFile[],
	heading: PageHeading,
): string {
	const added = files.reduce((sum, file) => sum + file.added, 0);
	const removed = files.reduce((sum, file) => sum + file.removed, 0);
	const nav = files
		.map(
			(file, i) =>
				`<a href="#f${i}"><span class="p">${escapeHtml(file.path)}</span><span class="n">${counts(file)}</span></a>`,
		)
		.join("");
	const sections = files
		.map(
			(file, i) =>
				`<details class="file" id="f${i}" open><summary><span class="path">${escapeHtml(file.path)}</span><span class="counts">${counts(file)}</span></summary><div class="scroll"><table><tbody>${rows(file)}</tbody></table></div></details>`,
		)
		.join("\n");

	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(heading.title)}</title>
<link rel="stylesheet" href="${FONTS}">
<style>${CSS}</style></head><body>
<header><h1>${escapeHtml(heading.title)}</h1>
<p><code>git diff ${escapeHtml(heading.range)}</code> · ${fileCount(files.length)} · <b class="a">+${added}</b> <b class="d">−${removed}</b></p></header>
<nav>${nav}</nav>
<main>${sections}</main>
</body></html>
`;
}
