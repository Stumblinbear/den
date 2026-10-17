// Renders a plan file as a page, for the plan-page skill's preamble.
//
// The argument is the plan file's path, taken as the whole argument string,
// so a path holding spaces arrives whole. The plan is JSON in the shape
// `skills/slicing/references/plan.schema.json` defines, and the page carries
// every file its blocks point at. One line on stdout names the page, with the
// plan's title, its step tallies and every source left unread.
//
// No argument, a file that cannot be read, or JSON that is not an object
// prints the reason and writes no page. The exit is 0 either way, so the
// preamble shows the reason rather than an error the session cannot read.
// The plan file is only ever read.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import process from "node:process";
import { renderPage } from "../lib/plan-page.mts";
import { resolveSources } from "../lib/plan-sources.mts";
import { errorMessage, fieldsOf, isTable } from "../lib/shared/fields.mts";

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

/** `n` of `noun` in words, plural except at one: `1 step`, `2 sources`. */
const count = (n: number, noun: string): string =>
	`${n} ${noun}${n === 1 ? "" : "s"}`;

/** Each step status the plan schema allows, and the line's words for it. */
const STATUS_WORDS = {
	committed: "committed",
	inProgress: "in progress",
	pending: "pending",
} as const;

/**
 * `steps` counted in all and by status, as the line words it:
 * `3 steps, 1 committed, 1 in progress, 1 pending`.
 */
function stepTally(steps: unknown): string {
	const statuses = Array.isArray(steps)
		? steps.map((step) => fieldsOf(step)["status"])
		: [];
	const tallies = Object.entries(STATUS_WORDS).map(
		([status, words]) =>
			`${statuses.filter((s) => s === status).length} ${words}`,
	);

	return [count(statuses.length, "step"), ...tallies].join(", ");
}

/**
 * Writes the page and returns the line to print: the page's path with the
 * plan's title and tallies, or the reason no page was written.
 */
function main(): string {
	const file = process.argv.slice(2).join(" ").trim();

	if (file === "") {
		return "No plan given: the argument is the plan file's path.";
	}

	let source: string;

	try {
		source = readFileSync(file, "utf8");
	} catch (error) {
		return `Cannot read ${file}: ${errorMessage(error)}`;
	}

	let plan: unknown;

	try {
		plan = JSON.parse(source);
	} catch (error) {
		return `${file} is not valid JSON: ${errorMessage(error)}`;
	}

	if (!isTable(plan)) {
		return `${file} holds no plan: its JSON is not an object.`;
	}

	const unread = resolveSources(plan, file);
	const name = basename(file, extname(file));
	const title =
		typeof plan["title"] === "string" && plan["title"] !== ""
			? plan["title"]
			: name;
	const path = pagePath(name);

	writeFileSync(path, renderPage(plan));

	const tally = stepTally(plan["steps"]);

	if (unread.length === 0) {
		return `Plan page: ${path} (${title}; ${tally})`;
	}

	const named = unread.map(({ source, reason }) => `${source}: ${reason}`);

	return `Plan page: ${path} (${title}; ${tally}; ${count(unread.length, "source")} unread). Not read: ${named.join("; ")}`;
}

process.stdout.write(`${main()}\n`);
