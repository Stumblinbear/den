// Prints steps of a plan as markdown, for the plan-step skill's preamble.
//
// The argument string is `<plan path> [step ID]`: a last word in a step ID's
// shape is the step's ID, so a path holding spaces arrives whole. Without
// a step the output covers the steps in progress, or every step when none
// is. It opens on one line with the plan's title, the steps it covers, every
// problem in the plan and every source that could not be read. The plan's
// frame and those steps in full follow.
//
// No argument, a plan that cannot be loaded or a step the plan lacks prints
// the reason alone. The exit is 0 either way, so a preamble shows the reason
// rather than an error the session cannot read.
import process from "node:process";
import { planLine } from "../lib/plan/line.mts";
import { loadPlan } from "../lib/plan/load.mts";
import { renderStepMarkdown } from "../lib/plan/step-markdown.mts";
import { fieldsOf } from "../lib/shared/fields.mts";

/** The steps the output covers, with the words its first line gives them. */
interface StepChoice {
	/** Indices into the plan's steps, from 0, in the order the output gives them. */
	readonly indices: readonly number[];
	/** The line's words for the steps: `step loader_seam: Title`. */
	readonly described: string;
}

/**
 * Chooses the steps the output covers: if `step` is given, the step with that
 * ID; else the steps in progress; else all of them.
 *
 * @remarks
 * Fails, with the reason, if the plan has no step `step`.
 */
function chooseSteps(
	steps: unknown[],
	step: string | undefined,
): StepChoice | { readonly failure: string } {
	const titled = (i: number): string => {
		const { id, title } = fieldsOf(steps[i]);

		return `step ${id ?? ""}: ${title ?? ""}`;
	};

	if (step !== undefined) {
		const i = steps.findIndex((s) => fieldsOf(s)["id"] === step);

		if (i < 0) {
			return { failure: `The plan has no step ${step}.` };
		}

		return { indices: [i], described: titled(i) };
	}

	const inProgress = steps.flatMap((s, i) =>
		fieldsOf(s)["status"] === "inProgress" ? [i] : [],
	);

	const [only] = inProgress;

	if (only !== undefined && inProgress.length === 1) {
		return {
			indices: [only],
			described: `${titled(only)}, the one in progress`,
		};
	}

	if (inProgress.length > 1) {
		return {
			indices: inProgress,
			described: `the ${inProgress.length} steps in progress`,
		};
	}

	return {
		indices: steps.map((_, i) => i),
		described: `every step of ${steps.length}, as none is in progress`,
	};
}

/**
 * Returns what to print: the line naming the plan and the steps, then their
 * markdown, or the reason alone where there are none to give.
 */
function main(): string {
	const argument = process.argv.slice(2).join(" ").trim();

	if (argument === "") {
		return "No plan given: the argument is the plan file's path, then optionally a step's ID.";
	}

	// A step ID's shape, which a path ending in a file name never has.
	const stepped = argument.match(/^(.*\S)\s+([a-z][a-z0-9]*(?:_[a-z0-9]+)*)$/);
	const file = stepped?.[1] ?? argument;
	const loaded = loadPlan(file);

	if ("failure" in loaded) {
		return loaded.failure;
	}

	const steps = loaded.plan["steps"];
	const choice = chooseSteps(Array.isArray(steps) ? steps : [], stepped?.[2]);

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
