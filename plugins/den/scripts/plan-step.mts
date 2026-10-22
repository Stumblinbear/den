// Prints one step of a plan as markdown, for the plan-step skill's preamble,
// whose output is the skill's text an agent works from.
//
// The argument string is `<plan path> [step number]`: a last word of digits
// after the path is the step's number, counted from 1, so a path holding
// spaces arrives whole. Without a number the output covers the step in
// progress, or every step where not exactly one is in progress. It opens on
// one line with the plan's title, the steps it covers, every problem in the
// plan and every source that could not be read, whose path and lines below
// may be wrong, so an agent meets them before the work. The plan's frame and
// those steps in full follow.
//
// No argument, a plan that cannot be loaded or a step the plan lacks prints
// the reason alone. The exit is 0 either way, so a preamble shows the reason
// rather than an error the session cannot read. The plan file is only ever
// read.
import process from "node:process";
import { count, planLine } from "../lib/plan/line.mts";
import { loadPlan } from "../lib/plan/load.mts";
import { renderStepMarkdown } from "../lib/plan/step-markdown.mts";
import { fieldsOf } from "../lib/shared/fields.mts";

/** The steps the output covers, with the words its first line gives them. */
interface StepChoice {
	/** Indices into the plan's steps, from 0, in the order the output gives them. */
	readonly indices: readonly number[];
	/** The line's words for the steps: `step 2 of 3: Title`. */
	readonly described: string;
}

/**
 * Chooses the steps the output covers: step `number`, counted from 1, where one
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
		};
	}

	return {
		indices: steps.map((_, i) => i),
		described: `every step of ${steps.length}, as ${inProgress.length === 0 ? "none is" : `${inProgress.length} are`} in progress`,
	};
}

/**
 * Returns what to print: the line naming the plan and the steps, then their
 * markdown, or the reason alone where there are none to give.
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

	const line = planLine(
		`Plan step: ${loaded.title}`,
		[choice.described],
		loaded,
	);

	return `${line}\n\n${renderStepMarkdown(loaded, choice.indices)}`;
}

process.stdout.write(`${main()}\n`);
