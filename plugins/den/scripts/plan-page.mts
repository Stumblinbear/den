// What the plan-page skill's preamble runs: a plan written in the den:slicing
// shape rendered as a page under `<os temp dir>/claude-den-plan-pages/`, and
// one line on stdout naming the file, with the plan's title and its step
// tallies. The argument is the plan file's path, taken as the whole argument
// string, so a path holding spaces arrives whole.
//
// No argument, or a file that cannot be read, prints the reason and exits 0,
// so the skill's preamble renders that reason rather than an error the
// session cannot read. Whatever else the file holds is rendered: a plan with
// no title goes under its file name.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import process from "node:process";
import {
	parsePlan,
	renderPage,
	type StepState,
	stepCount,
} from "../lib/plan-page.mts";

/**
 * The directory pages go in, under the OS temp directory beside the diff
 * pages', so a page outlives nothing it should not and needs no cleanup of
 * its own.
 */
const PAGES_DIR = "claude-den-plan-pages";

/**
 * The file this render goes to, named for the plan and stamped with the
 * moment, in a directory the call creates where it is missing.
 */
function pagePath(name: string): string {
	const stamp = new Date()
		.toISOString()
		.replace(/[:.]/g, "-")
		.replace("T", "-")
		.slice(0, 19);
	const dir = join(tmpdir(), PAGES_DIR);

	mkdirSync(dir, { recursive: true });

	return join(dir, `${name}-${stamp}.html`);
}

/** A plan's text, or why the file naming it could not be read. */
type Source = { text: string } | { failure: string };

/** The text of `file`, or the failure reading it gave; never throws. */
function read(file: string): Source {
	try {
		return { text: readFileSync(file, "utf8") };
	} catch (error) {
		const why = error instanceof Error ? error.message : String(error);

		return { failure: `Cannot read ${file}: ${why}` };
	}
}

/**
 * The line to print: the page's path with the plan's title and step tallies,
 * or the reason no page was written. Writes the page as its one effect.
 */
function main(): string {
	const file = process.argv.slice(2).join(" ").trim();

	if (file === "") {
		return "No plan given: the argument is the plan file's path.";
	}

	const source = read(file);

	if ("failure" in source) {
		return source.failure;
	}

	const plan = parsePlan(source.text);
	const name = basename(file, extname(file));
	const title = plan.title === "" ? name : plan.title;
	const steps = plan.sections.filter((section) => section.step !== null);
	const tally = (state: StepState): number =>
		steps.filter((step) => step.state === state).length;
	const path = pagePath(name);

	writeFileSync(path, renderPage(plan, title));

	return `Plan page: ${path} (${title}; ${stepCount(steps.length)}, ${tally("committed")} committed, ${tally("in progress")} in progress, ${tally("pending")} pending)`;
}

process.stdout.write(`${main()}\n`);
