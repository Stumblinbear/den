// Renders a plan file as a page, for the plan-page skill's preamble.
//
// The argument is the plan file's path, taken as the whole argument string,
// so a path holding spaces arrives whole. The plan is JSON in the shape
// `skills/planning/references/plan.schema.json` defines, and the page carries
// every file its blocks point at. One line on stdout names the page, with the
// plan's title, its step tallies, every source left unread and every problem
// in the plan.
//
// No argument, a file that cannot be read, JSON that does not parse, or JSON
// that is not an object prints the reason and writes no page. The exit is 0
// either way, so the preamble shows the reason rather than an error the
// session cannot read. The plan file is only ever read.
import { writeFileSync } from "node:fs";
import process from "node:process";
import { count, planLine } from "../lib/plan/line.mts";
import { loadPlan } from "../lib/plan/load.mts";
import { renderPage } from "../lib/plan/page.mts";
import { STEP_STATUS_WORDS } from "../lib/plan/step-status.mts";
import { fieldsOf } from "../lib/shared/fields.mts";
import { stampedTempFile } from "../lib/stamped-temp-file.mts";

/** The directory under the OS temp directory that pages go in. */
const PAGES_DIR = "claude-den-plan-pages";

/**
 * `steps` counted in all and by status, as the line words it:
 * `3 steps, 1 committed, 1 in progress, 1 pending`.
 */
function stepTally(steps: unknown): string {
	const statuses = Array.isArray(steps)
		? steps.map((step) => fieldsOf(step)["status"])
		: [];
	const tallies = Object.entries(STEP_STATUS_WORDS).map(
		([status, words]) =>
			`${statuses.filter((s) => s === status).length} ${words}`,
	);

	return [count(statuses.length, "step"), ...tallies].join(", ");
}

/**
 * Writes the page and returns the line to print, which names the page or
 * gives the reason no page was written.
 */
function main(): string {
	const file = process.argv.slice(2).join(" ").trim();

	if (file === "") {
		return "No plan given: the argument is the plan file's path.";
	}

	const loaded = loadPlan(file);

	if ("failure" in loaded) {
		return loaded.failure;
	}

	const { plan, name, title, problems } = loaded;
	const path = stampedTempFile(PAGES_DIR, name, "html");

	writeFileSync(path, renderPage(plan, problems));

	return planLine(
		`Plan page: ${path}`,
		[title, stepTally(plan["steps"])],
		loaded,
	);
}

process.stdout.write(`${main()}\n`);
