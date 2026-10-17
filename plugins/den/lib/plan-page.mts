// Plan pages: `renderPage` writes a plan into `plan-viewer.html` as one HTML
// file.
import { readFileSync } from "node:fs";

const VIEWER = new URL("./plan-viewer.html", import.meta.url);
const MARKED = new URL("./marked.min.js", import.meta.url);

/**
 * The empty `#plan` and `#marked` elements, exactly as `plan-viewer.html`
 * ships them; each is replaced whole.
 */
const PLAN_SLOT = '<script type="application/json" id="plan">{}</script>';
const MARKED_SLOT = '<script id="marked"></script>';

/** `page` with its first `slot` replaced by `filled`; throws where it has none. */
function fill(page: string, slot: string, filled: string): string {
	const at = page.indexOf(slot);

	if (at === -1) {
		throw new Error(`plan-viewer.html has no ${slot} to fill`);
	}

	return page.slice(0, at) + filled + page.slice(at + slot.length);
}

/**
 * The HTML page showing `plan`, as one file that loads nothing over the
 * network but its fonts.
 *
 * @remarks
 * No string in `plan` can close the script element the plan sits in.
 */
export function renderPage(plan: unknown): string {
	// `\u003c` parses back to `<` and leaves no `</script>` in the element.
	const json = JSON.stringify(plan).replace(/</g, "\\u003c");
	const viewer = readFileSync(VIEWER, "utf8");
	const marked = readFileSync(MARKED, "utf8");
	const withPlan = fill(
		viewer,
		PLAN_SLOT,
		`<script type="application/json" id="plan">${json}</script>`,
	);

	return fill(withPlan, MARKED_SLOT, `<script id="marked">${marked}</script>`);
}
