// Plan checks: `planProblems` finds what is wrong in a plan's JSON.
import { fieldsOf, isTable } from "../shared/fields.mts";
import { diffRows } from "./diff.mts";
import { blocksIn, openQuestionsOf, proposalsOf } from "./parts.mts";

/** Reads `value` as an array, empty where it is none. */
const elements = (value: unknown): unknown[] =>
	Array.isArray(value) ? value : [];

/**
 * Lists the problems in `plan`, one sentence for each fault.
 *
 * @remarks
 * A problem is any of these rules broken; an ID used more than once is one
 * fault however many times it repeats:
 * - every survey fact, open question and proposal has an ID, and no ID is
 *   used twice among them;
 * - a block in a step is about open questions the plan has, and a fact block
 *   in one names a survey fact;
 * - a diff block in a step changes one file;
 * - every block at the top of a step's `reliesOn`, a fact aside, has a
 *   caption saying why.
 *
 * `plan` may be any parsed JSON. A step, survey fact, open question or
 * proposal that is not an object is a problem of its own, since none of its
 * checks can run. A block that is not an object is passed over, except at the
 * top of `reliesOn`, where any truthy one counts as a block without a caption.
 * `plan` is only read.
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

	for (const [i, step] of steps.entries()) {
		if (!isTable(step)) {
			problems.push(`Step ${i + 1} is not an object.`);
			continue;
		}

		for (const block of blocksIn(step)) {
			for (const id of elements(block["about"])) {
				if (!openIds.has(id)) {
					problems.push(
						`Step ${i + 1} has a block about “${id}”, which isn’t an open question.`,
					);
				}
			}

			if (block["kind"] === "diff") {
				const files = diffRows(String(block["patch"] || "")).files.length;

				if (files > 1) {
					problems.push(
						`Step ${i + 1} has a diff covering ${files} files. Give each file its own block.`,
					);
				}
			}

			if (block["kind"] === "fact" && !factIds.has(block["id"])) {
				problems.push(
					`Step ${i + 1} relies on ${block["id"]}, which isn’t in the survey.`,
				);
			}
		}

		for (const block of elements(step["reliesOn"])) {
			const fields = fieldsOf(block);

			if (block && fields["kind"] !== "fact" && !fields["caption"]) {
				problems.push(
					`Step ${i + 1} relies on a ${fields["kind"] || "block"} block without a caption saying why.`,
				);
			}
		}
	}

	return problems;
}
