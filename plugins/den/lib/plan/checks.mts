// Plan checks: `planProblems` finds what is wrong in a plan's JSON.
import { fieldsOf, isTable } from "../shared/fields.mts";
import { diffRows } from "./diff.mts";
import { blocksIn, openQuestionsOf, proposalsOf } from "./parts.mts";

/** Reads `value` as an array, empty where it is none. */
const elements = (value: unknown): unknown[] =>
	Array.isArray(value) ? value : [];

/**
 * Names `step` in a problem: by its ID, or by its title where it has no ID.
 */
const stepName = (step: Record<string, unknown>): string =>
	step["id"]
		? `Step ${step["id"]}`
		: `The step titled “${step["title"] ?? ""}”`;

/**
 * Lists the problems in `plan`, one sentence for each fault.
 *
 * @remarks
 * A problem is any of these rules broken; an ID used more than once is one
 * fault however many times it repeats:
 * - every step, survey fact, open question and proposal has an ID, and no ID
 *   is used twice among them;
 * - each ID in a step's `after` is the ID of a step earlier in the plan;
 * - a block in a step is about open questions the plan has, and a fact block
 *   in one has a survey fact's ID;
 * - a diff block in a step changes one file;
 * - every block at the top of a step's `reliesOn`, a fact aside, has a
 *   caption saying why.
 *
 * `plan` may be any parsed JSON. A step, survey fact, open question or
 * proposal that is not an object is a problem of its own. A block that is not
 * an object is passed over, except at the top of `reliesOn`, where any truthy
 * one counts as a block without a caption.
 */
export function planProblems(plan: Record<string, unknown>): string[] {
	const problems: string[] = [];
	const steps = elements(plan["steps"]);
	const survey = elements(plan["survey"]);
	const openQuestions = openQuestionsOf(plan);

	const claimed = new Map<unknown, number>();
	const claim = (entry: unknown, what: string): void => {
		if (!isTable(entry)) {
			problems.push(`A ${what} is not an object.`);
			return;
		}

		const id = entry["id"];

		if (!id) {
			problems.push(`A ${what} has no ID.`);
			return;
		}

		const times = (claimed.get(id) ?? 0) + 1;

		if (times === 2) {
			problems.push(`${id} is used more than once.`);
		}

		claimed.set(id, times);
	};

	// A step is reported by its own name, which `claim` cannot give. One that
	// is not an object is reported by the step checks below.
	for (const step of steps.filter(isTable)) {
		if (step["id"]) {
			claim(step, "step");
		} else {
			problems.push(`${stepName(step)} has no ID.`);
		}
	}

	for (const fact of survey) {
		claim(fact, "survey fact");
	}

	for (const question of openQuestions) {
		claim(question, "open question");
	}

	for (const proposal of proposalsOf(plan)) {
		claim(proposal, "proposal");
	}

	const factIds = new Set(survey.map((fact) => fieldsOf(fact)["id"]));
	const openIds = new Set(
		openQuestions.map((question) => fieldsOf(question)["id"]),
	);
	const stepIds = new Set(steps.map((step) => fieldsOf(step)["id"]));
	const earlierStepIds = new Set<unknown>();

	for (const step of steps) {
		if (!isTable(step)) {
			problems.push("A step is not an object.");
			continue;
		}

		const name = stepName(step);

		for (const id of elements(step["after"])) {
			if (!stepIds.has(id)) {
				problems.push(`${name} comes after “${id}”, which isn’t a step.`);
			} else if (!earlierStepIds.has(id)) {
				problems.push(
					`${name} comes after “${id}”, which isn’t earlier in the plan.`,
				);
			}
		}

		earlierStepIds.add(step["id"]);

		for (const block of blocksIn(step)) {
			for (const id of elements(block["about"])) {
				if (!openIds.has(id)) {
					problems.push(
						`${name} has a block about “${id}”, which isn’t an open question.`,
					);
				}
			}

			if (block["kind"] === "diff") {
				const files = diffRows(String(block["patch"] || "")).files.length;

				if (files > 1) {
					problems.push(
						`${name} has a diff covering ${files} files. Give each file its own block.`,
					);
				}
			}

			if (block["kind"] === "fact" && !factIds.has(block["id"])) {
				problems.push(
					`${name} relies on ${block["id"]}, which isn’t in the survey.`,
				);
			}
		}

		for (const block of elements(step["reliesOn"])) {
			const fields = fieldsOf(block);

			if (block && fields["kind"] !== "fact" && !fields["caption"]) {
				problems.push(
					`${name} relies on a ${fields["kind"] || "block"} block without a caption saying why.`,
				);
			}
		}
	}

	return problems;
}
