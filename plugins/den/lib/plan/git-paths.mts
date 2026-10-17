// Plan gitPaths: `normaliseGitPaths` writes every `gitPath` in a plan with `/`.
import { isTable } from "../shared/fields.mts";
import { blocksOf, openQuestionsOf } from "./parts.mts";

/** Replaces each backslash in `holder`'s `gitPath`, where it is a string. */
function normalise(holder: Record<string, unknown>): void {
	const gitPath = holder["gitPath"];

	if (typeof gitPath === "string") {
		holder["gitPath"] = gitPath.replaceAll("\\", "/");
	}
}

/**
 * Replaces every backslash in `plan`'s `gitPath`s with `/`, the separator git
 * and the disk both take.
 *
 * @remarks
 * A plan may write a `gitPath` with either separator; afterwards every one the
 * plan schema allows, at any depth, uses `/`. `plan` is changed in place. A
 * file whose name holds a backslash cannot be named.
 */
export function normaliseGitPaths(plan: Record<string, unknown>): void {
	for (const question of openQuestionsOf(plan).filter(isTable)) {
		normalise(question);
	}

	for (const block of blocksOf(plan)) {
		normalise(block);

		if (isTable(block["from"])) {
			normalise(block["from"]);
		}
	}
}
