// Plan pages: `renderPage` fills `viewer.html` with a plan, as one HTML file.
import { readFileSync } from "node:fs";
import { DIFF_PARSER_SCRIPT } from "./diff.mts";
import { BLOCK_WALK_SCRIPT } from "./parts.mts";

const VIEWER = new URL("./viewer.html", import.meta.url);
const MARKED = new URL("./marked.min.js", import.meta.url);

/**
 * The empty `#plan`, `#problems`, `#diff-parser`, `#block-walk` and `#marked`
 * elements, each written exactly as `viewer.html` ships it, for `fill` to
 * replace whole.
 */
const PLAN_SLOT = '<script type="application/json" id="plan">{}</script>';
const PROBLEMS_SLOT =
	'<script type="application/json" id="problems">[]</script>';
const DIFF_PARSER_SLOT = '<script id="diff-parser"></script>';
const BLOCK_WALK_SLOT = '<script id="block-walk"></script>';
const MARKED_SLOT = '<script id="marked"></script>';

/**
 * Replaces the first `slot` in `page` with `filled`; throws where it has none.
 */
function fill(page: string, slot: string, filled: string): string {
	const at = page.indexOf(slot);

	if (at === -1) {
		throw new Error(`viewer.html has no ${slot} to fill`);
	}

	return page.slice(0, at) + filled + page.slice(at + slot.length);
}

/**
 * Writes `value` as a JSON script element with the id `id`, which no string
 * in `value` can close.
 */
function jsonScript(id: string, value: unknown): string {
	// `<` parses back to `<` and leaves no `</script>` in the element.
	const json = JSON.stringify(value).replace(/</g, "\\u003c");

	return `<script type="application/json" id="${id}">${json}</script>`;
}

/**
 * Writes the HTML page showing `plan`, with `problems` in its problems box.
 *
 * @remarks
 * The page is one file that loads nothing over the network but its fonts. No
 * string in `plan` or `problems` can close the script element it sits in.
 * Throws where `viewer.html` lacks one of the elements the slots name.
 */
export function renderPage(plan: unknown, problems: readonly string[]): string {
	const viewer = readFileSync(VIEWER, "utf8");
	const marked = readFileSync(MARKED, "utf8");
	const slots: [string, string][] = [
		[PLAN_SLOT, jsonScript("plan", plan)],
		[PROBLEMS_SLOT, jsonScript("problems", problems)],
		[
			DIFF_PARSER_SLOT,
			`<script id="diff-parser">${DIFF_PARSER_SCRIPT}</script>`,
		],
		[BLOCK_WALK_SLOT, `<script id="block-walk">${BLOCK_WALK_SCRIPT}</script>`],
		[MARKED_SLOT, `<script id="marked">${marked}</script>`],
	];

	return slots.reduce(
		(page, [slot, filled]) => fill(page, slot, filled),
		viewer,
	);
}
