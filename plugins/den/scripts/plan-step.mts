// Writes one step of a plan as a markdown file for an agent to work from.
//
// The argument string is `<plan path> [step number]`: a last word of digits
// after the path is the step's number, counted from 1, so a path holding
// spaces arrives whole. Without a number the file covers the step in
// progress, or every step where not exactly one is in progress. The file
// holds the plan's frame and those steps in full. One line on stdout names
// the file, with the plan's title, the steps it covers, every problem in the
// plan and every source that could not be read, whose path and lines in the
// file may be wrong.
//
// No argument, a plan that cannot be loaded or a step the plan lacks prints
// the reason and writes no file. The exit is 0 either way, so a preamble
// shows the reason rather than an error the session cannot read. The plan
// file is only ever read.
import { writeFileSync } from "node:fs";
import process from "node:process";
import { count, planLine } from "../lib/plan/line.mts";
import { loadPlan } from "../lib/plan/load.mts";
import { renderStepMarkdown } from "../lib/plan/step-markdown.mts";
import { fieldsOf } from "../lib/shared/fields.mts";
import { stampedTempFile } from "../lib/stamped-temp-file.mts";

/** The directory under the OS temp directory that step files go in. */
const STEPS_DIR = "claude-den-plan-steps";

/**
 * The steps a file covers, with the words the line and the file's name give
 * them.
 */
interface StepChoice {
	/** Indices into the plan's steps, from 0, in the order the file gives them. */
	readonly indices: readonly number[];
	/** The line's words for the steps: `step 2 of 3: Title`. */
	readonly described: string;
	/** The file name's words for the steps: `step-2`, `steps`. */
	readonly named: string;
}

/**
 * Chooses the steps the file covers: step `number`, counted from 1, where one
 * is given, else the one step in progress, else all of them.
 *
 * @remarks
 * Fails, with the reason, where the plan has no step `number`.
 */
function chooseSteps(
	steps: unknown[],
	number: number | undefined,
): StepChoice | { readonly failure: string } {
	const titled = (i: number): string =>
		`step ${i + 1} of ${steps.length}: ${fieldsOf(steps[i])["title"] ?? ""}`;

	if (number !== undefined) {
		if (number < 1 || number > steps.length) {
			return {
				failure: `The plan has no step ${number}: it has ${count(steps.length, "step")}.`,
			};
		}

		return {
			indices: [number - 1],
			described: titled(number - 1),
			named: `step-${number}`,
		};
	}

	const inProgress = steps.flatMap((step, i) =>
		fieldsOf(step)["status"] === "inProgress" ? [i] : [],
	);
	const [only] = inProgress;

	if (only !== undefined && inProgress.length === 1) {
		return {
			indices: [only],
			described: `${titled(only)}, the one in progress`,
			named: `step-${only + 1}`,
		};
	}

	return {
		indices: steps.map((_, i) => i),
		described: `every step of ${steps.length}, as ${inProgress.length === 0 ? "none is" : `${inProgress.length} are`} in progress`,
		named: "steps",
	};
}

/**
 * Writes the file and returns the line to print, which names the file or
 * gives the reason no file was written.
 */
function main(): string {
	const argument = process.argv.slice(2).join(" ").trim();

	if (argument === "") {
		return "No plan given: the argument is the plan file's path, then optionally a step number.";
	}

	const numbered = argument.match(/^(.*\S)\s+(\d+)$/);
	const file = numbered?.[1] ?? argument;
	const loaded = loadPlan(file);

	if ("failure" in loaded) {
		return loaded.failure;
	}

	const steps = loaded.plan["steps"];
	const choice = chooseSteps(
		Array.isArray(steps) ? steps : [],
		numbered?.[2] === undefined ? undefined : Number(numbered[2]),
	);

	if ("failure" in choice) {
		return choice.failure;
	}

	const path = stampedTempFile(
		STEPS_DIR,
		`${loaded.name}-${choice.named}`,
		"md",
	);

	writeFileSync(path, renderStepMarkdown(loaded, choice.indices));

	return planLine("Plan step", path, [loaded.title, choice.described], loaded);
}

process.stdout.write(`${main()}\n`);
