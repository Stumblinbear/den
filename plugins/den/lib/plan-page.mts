// A plan as a page, for reading on a phone.
//
// - `parsePlan` reads the markdown subset `den:slicing` names into a `Plan`:
//   a first screen, then a `Section` per heading, each a list of `Block`s.
// - `renderPage` lays a `Plan` out as one HTML page, a card per section.
// - `CSS` is the stylesheet that page carries, and `stepCount` words a tally
//   of steps for the line that announces the page.
//
// The page loads two faces from Google Fonts, with system fallbacks; nothing
// else on it reaches out, and it runs no script.

/** How far the work on a step has got. */
export type StepState = "committed" | "in progress" | "pending";

/** A piece of a section, or of the plan's first screen. */
export type Block =
	| { readonly kind: "paragraph"; readonly text: string }
	| { readonly kind: "list"; readonly items: readonly string[] }
	| {
			readonly kind: "code";
			/** The text after the opening backticks: a language, then a caption. */
			readonly info: string;
			readonly lines: readonly string[];
	  };

/** A `## ` heading and everything under it, up to the next one. */
export interface Section {
	/** The heading's text, with a state tag the page knows taken off it. */
	readonly title: string;
	/** The tag the heading carried, null where it carried none. */
	readonly state: StepState | null;
	/** The `N` of `## Step N:`, null for a heading that numbers no step. */
	readonly step: number | null;
	readonly blocks: Block[];
}

/** A whole plan, as one markdown file holds it. */
export interface Plan {
	/** The `# ` line, empty for a file that carries none. */
	readonly title: string;
	/** What stands before the first `## `: the plan's first screen. */
	readonly intro: Block[];
	readonly sections: Section[];
}

/** The tags a step's heading can carry. */
const STATES: readonly StepState[] = ["committed", "in progress", "pending"];

// `## Step 3: the notice [pending]` splits into the title and the tag. A tag
// outside STATES is no tag: it stays in the title, and the step counts under
// no state.
const HEADING = new RegExp(
	`^## (.*?)(?:\\s*\\[(${STATES.join("|")})\\])?\\s*$`,
);

const STEP = /^Step (\d+):/;
const BULLET = /^[-*] /;
const FENCE = /^(`{3,})(.*)$/;
const BLOCK_START = /^(#|```|[-*] )/;

// The line labels the den:slicing plan shape defines.
const LABEL =
	/^(Gate|Decided \(you\)|Decided|Open|Not doing|Constraints|Tests):\s*/;

/** One block read out of the lines, with the index the plan resumes at. */
interface Read {
	readonly block: Block;
	/**
	 * Always past the index the reader was given: `parsePlan` reads whatever
	 * line it is left on, and an index that does not move loops for good.
	 */
	readonly next: number;
}

/**
 * The fence opening at `start`, up to the line that closes it.
 *
 * `opened` is `FENCE` matched against `lines[start]`. The fence closes on a
 * run of backticks at least as long as the one that opened it, so a fence
 * pasted inside the plan's own markdown nests under a longer run. One never
 * closed takes the rest of `lines`.
 */
function readFence(
	lines: readonly string[],
	start: number,
	opened: RegExpExecArray,
): Read {
	// Every FENCE match fills both groups, so the fallbacks are for the type.
	const close = opened[1] ?? "";
	const info = (opened[2] ?? "").trim();
	const body: string[] = [];
	let i = start + 1;

	while (i < lines.length) {
		const line = lines[i] ?? "";

		if (line.startsWith(close)) {
			break;
		}

		body.push(line);
		i += 1;
	}

	return { block: { kind: "code", info, lines: body }, next: i + 1 };
}

/** The run of bullet lines at `start`, as one list. */
function readList(lines: readonly string[], start: number): Read {
	const items: string[] = [];
	let i = start;

	while (i < lines.length) {
		const line = lines[i] ?? "";

		if (!BULLET.test(line)) {
			break;
		}

		items.push(line.slice(2));
		i += 1;
	}

	return { block: { kind: "list", items }, next: i };
}

/**
 * The lines from `start` up to the next blank line, block or labelled line,
 * as one paragraph.
 *
 * The first line is taken whatever it holds, so every call advances:
 * `readBlock` has ruled the other readers out for it already, and a line no
 * reader takes is a line `parsePlan` never gets past.
 */
function readParagraph(lines: readonly string[], start: number): Read {
	const text: string[] = [lines[start] ?? ""];
	let i = start + 1;

	while (i < lines.length) {
		const line = lines[i] ?? "";

		if (line.trim() === "" || BLOCK_START.test(line) || LABEL.test(line)) {
			break;
		}

		text.push(line);
		i += 1;
	}

	// One paragraph is one text, so `paragraph` reads a label at the start of
	// the whole of it and never on a wrapped line.
	return { block: { kind: "paragraph", text: text.join(" ") }, next: i };
}

/** The section a `## ` line opens, with nothing under it yet. */
function readHeading(line: string): Section {
	// Every `## ` line matches, so the fallbacks below are for the type.
	const heading = HEADING.exec(line);
	const title = heading?.[1] ?? "";
	const tag = heading?.[2];
	const step = STEP.exec(title);

	return {
		title,
		state: STATES.find((state) => state === tag) ?? null,
		step: step === null ? null : Number(step[1]),
		blocks: [],
	};
}

/**
 * The plan a markdown file holds.
 *
 * The last `# ` line is the title, everything before the first `## ` is the
 * first screen, and every `## ` line opens a section, numbered step or not.
 * Every other line is a block of the section it stands in.
 */
export function parsePlan(text: string): Plan {
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	const intro: Block[] = [];
	const sections: Section[] = [];
	let title = "";
	let i = 0;

	while (i < lines.length) {
		const line = lines[i] ?? "";
		const blocks = sections.at(-1)?.blocks ?? intro;

		if (line.startsWith("# ")) {
			title = line.slice(2).trim();
			i += 1;
		} else if (line.startsWith("## ")) {
			sections.push(readHeading(line));
			i += 1;
		} else if (line.trim() === "") {
			i += 1;
		} else {
			const read = readBlock(lines, i);

			blocks.push(read.block);
			i = read.next;
		}
	}

	return { title, intro, sections };
}

/** The block opening at `start`: a fence, a list, or a paragraph. */
function readBlock(lines: readonly string[], start: number): Read {
	const line = lines[start] ?? "";
	const fence = FENCE.exec(line);

	if (fence !== null) {
		return readFence(lines, start, fence);
	}

	if (BULLET.test(line)) {
		return readList(lines, start);
	}

	return readParagraph(lines, start);
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/** A tally of steps in words: `1 step`, `2 steps`. */
export const stepCount = (count: number): string =>
	`${count} step${count === 1 ? "" : "s"}`;

/** Inline markdown as HTML: code spans, bold and links, the rest escaped. */
function inline(text: string): string {
	const spans: string[] = [];
	// Escaping first makes `<N>` a shape the plan's own words cannot spell,
	// and keeps a span's content out of the bold and link passes below.
	const lifted = escapeHtml(text).replace(/`([^`]+)`/g, (_, code: string) => {
		spans.push(`<code>${code}</code>`);

		return `<${spans.length - 1}>`;
	});

	return lifted
		.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
		.replace(/<(\d+)>/g, (slot, index: string) => spans[Number(index)] ?? slot);
}

/** The CSS class a state's pill wears. */
function pillClass(state: StepState): string {
	switch (state) {
		case "committed":
			return "done";

		case "in progress":
			return "now";

		case "pending":
			return "next";
	}
}

const pill = (state: StepState | null): string =>
	state === null
		? ""
		: `<span class="state ${pillClass(state)}">${state}</span>`;

/** One line of a fence, escaped, coloured where the fence is a diff. */
function codeLine(lang: string, line: string): string {
	const text = escapeHtml(line);

	if (lang === "diff" && line.startsWith("+")) {
		return `<span class="add">${text}</span>`;
	}

	if (lang === "diff" && line.startsWith("-")) {
		return `<span class="del">${text}</span>`;
	}

	return text;
}

/**
 * A fence as a captioned code block.
 *
 * The info string's first word is the language, and the rest is the caption,
 * where a plan names the file the code came from. An info string of one word
 * gets no caption bar.
 */
function codeBlock(info: string, lines: readonly string[]): string {
	const lang = info.split(/\s+/)[0] ?? "";
	const caption = info.slice(lang.length).trim();
	const body = lines.map((line) => codeLine(lang, line)).join("\n");
	const cap =
		caption === "" ? "" : `<div class="cap">${escapeHtml(caption)}</div>`;

	return `<div class="code">${cap}<pre>${body}</pre></div>`;
}

/** A paragraph as HTML, a labelled line under the shape its label gets. */
function paragraph(text: string): string {
	const labelled = LABEL.exec(text);

	if (labelled === null) {
		return `<p>${inline(text)}</p>`;
	}

	const label = labelled[1] ?? "";
	const body = inline(text.slice(labelled[0].length));

	if (label === "Gate") {
		return `<p class="gate"><b>Gate</b> ${body}</p>`;
	}

	if (label === "Open") {
		return `<div class="open"><b>Open decision</b> ${body}</div>`;
	}

	if (label.startsWith("Decided")) {
		// A decision the user made wears their pill: the page is asking them
		// to stand behind that one.
		const you = label.includes("you") ? '<span class="you">you</span>' : "";
		const decision = body.replace(
			/Rejected:/g,
			'<span class="alt">Rejected:</span>',
		);

		return `<div class="decided"><p>${you}${decision}</p></div>`;
	}

	return `<p><b>${label}.</b> ${body}</p>`;
}

function renderBlock(block: Block): string {
	switch (block.kind) {
		case "paragraph":
			return paragraph(block.text);

		case "list":
			return `<ul>${block.items.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`;

		case "code":
			return codeBlock(block.info, block.lines);
	}
}

const renderBlocks = (blocks: readonly Block[]): string =>
	blocks.map(renderBlock).join("");

/**
 * The anchor a section is linked by: its step number, so a link holds while
 * the sections around it move, or its position where it numbers no step.
 */
const sectionId = (section: Section, index: number): string =>
	section.step === null ? `x${index}` : `s${section.step}`;

/** A row per step: its number, its title linked to its card, and its state. */
function stepTable(steps: readonly Section[]): string {
	const rows = steps
		.map(
			(step) =>
				`<tr><td>${step.step}</td><td><a href="#s${step.step}">${inline(step.title.replace(/^Step \d+:\s*/, ""))}</a></td><td>${pill(step.state)}</td></tr>`,
		)
		.join("");

	return `<div class="card"><h2>Steps</h2><table class="grid"><tr><th>#</th><th>Step</th><th>State</th></tr>${rows}</table></div>`;
}

const card = (section: Section, index: number): string =>
	`<div class="card" id="${sectionId(section, index)}"><h2>${inline(section.title)}${pill(section.state)}</h2>${renderBlocks(section.blocks)}</div>`;

const MONO = '"JetBrains Mono", ui-monospace, Consolas, monospace';

/** The stylesheet the page carries, in a light scheme and a dark one. */
export const CSS = `
:root {
  --bg:#F5F6F8; --panel:#FFFFFF; --ink:#1E2328; --mute:#5C6670; --rule:#D9DEE4; --accent:#1B6F6A;
  --add-bg:#E3F3E8; --add-ink:#1A6B3A; --del-bg:#FBE7E7; --del-ink:#9E2A2A; --hunk-bg:#EEF2F6; --hunk-ink:#4C6A8A;
  --warn-bg:#FFF4DC; --warn-ink:#8A5A00; --you-bg:#EAF0FB; --you-ink:#2B4C8C; --mono:${MONO};
}
@media (prefers-color-scheme: dark) { :root {
  --bg:#141719; --panel:#1B1F23; --ink:#E4E8EC; --mute:#98A2AD; --rule:#2C333A; --accent:#5FC3BC;
  --add-bg:#1B3323; --add-ink:#8FD9A6; --del-bg:#3D2023; --del-ink:#F19A9A; --hunk-bg:#20272F; --hunk-ink:#8FB3D9;
  --warn-bg:#3A2E14; --warn-ink:#F0C060; --you-bg:#1E2A40; --you-ink:#9DB8EE;
} }
body { background:var(--bg); color:var(--ink); font:15px/1.5 "IBM Plex Sans", system-ui, sans-serif; margin:0; }
header { padding:18px 18px 12px; border-bottom:1px solid var(--rule); background:var(--panel); }
header h1 { font-size:20px; font-weight:600; margin:0 0 6px; }
header p { margin:6px 0 0; max-width:74ch; }
code { font-family:var(--mono); font-size:12.5px; background:var(--hunk-bg); padding:0 4px; border-radius:3px; }
main { padding:0 0 40px; }
.card { background:var(--panel); border-top:1px solid var(--rule); border-bottom:1px solid var(--rule); margin-top:14px; padding:12px 18px 14px; }
.card h2 { font-size:16px; font-weight:600; margin:0 0 6px; display:flex; justify-content:space-between; gap:12px; align-items:baseline; }
.card p, .card ul { max-width:74ch; margin:8px 0; }
.card ul { padding-left:20px; }
.state { font-family:var(--mono); font-size:12px; padding:1px 7px; border-radius:10px; white-space:nowrap; }
.state.done { background:var(--add-bg); color:var(--add-ink); } .state.now { background:var(--warn-bg); color:var(--warn-ink); } .state.next { background:var(--hunk-bg); color:var(--hunk-ink); }
.you { display:inline-block; background:var(--you-bg); color:var(--you-ink); font-size:12px; font-weight:500; padding:0 6px; border-radius:10px; margin-right:6px; vertical-align:1px; }
.decided { border-left:3px solid var(--you-ink); padding:2px 0 2px 12px; margin:10px 0; max-width:74ch; }
.decided p { margin:4px 0; }
.alt { color:var(--mute); }
.open { border:2px solid var(--warn-ink); border-radius:6px; padding:8px 12px; margin:10px 0; max-width:74ch; }
.gate { color:var(--mute); font-size:14px; } .gate b { color:var(--add-ink); font-weight:500; margin-right:6px; }
.code { border:1px solid var(--rule); border-radius:4px; margin:10px 0; overflow:hidden; }
.code .cap { font-family:var(--mono); font-size:12px; color:var(--accent); padding:4px 10px; background:var(--hunk-bg); border-bottom:1px solid var(--rule); }
.code pre { margin:0; padding:8px 12px; font-family:var(--mono); font-size:12.5px; line-height:1.45; overflow-x:auto; tab-size:4; }
.code .add { display:inline-block; width:100%; background:var(--add-bg); color:var(--add-ink); }
.code .del { display:inline-block; width:100%; background:var(--del-bg); color:var(--del-ink); }
table.grid { border-collapse:collapse; width:100%; font-size:14px; margin:8px 0; }
table.grid th, table.grid td { text-align:left; padding:5px 10px; border-bottom:1px solid var(--rule); vertical-align:top; }
table.grid th { color:var(--mute); font-weight:500; font-size:13px; }
`;

const FONTS =
	"https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";

/**
 * The whole page: `title` as its heading, the first screen under that, then
 * the step table and a card per section.
 *
 * A plan with no numbered step gets no step table.
 */
export function renderPage(plan: Plan, title: string): string {
	const steps = plan.sections.filter((section) => section.step !== null);
	const table = steps.length === 0 ? "" : stepTable(steps);
	const cards = plan.sections.map(card).join("");

	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${FONTS}">
<style>${CSS}</style></head><body>
<header><h1>${escapeHtml(title)}</h1>${renderBlocks(plan.intro)}</header>
<main>${table}${cards}</main>
</body></html>
`;
}
