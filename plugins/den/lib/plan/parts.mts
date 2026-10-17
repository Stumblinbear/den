// A plan's parts: `blocksIn` and `blocksOf` walk a step's blocks and a whole
// plan's, `openQuestionsIn`, `userDecisionsIn` and `proposalsIn` read a plan
// or step's own decision lists, `openQuestionsOf` and `proposalsOf` the whole
// plan's, and `BLOCK_WALK_SCRIPT` carries the step walk into the page.
import { fieldsOf, isTable } from "../shared/fields.mts";

// The page inlines blocksAmong and blocksIn as BLOCK_WALK_SCRIPT; see the
// comment above splitLines in diff.mts for what they may reference.

/**
 * Walks the objects in `blocks`, each followed by the blocks it holds where it
 * is a row or fact block, at any depth.
 *
 * @remarks
 * Yields nothing where `blocks` is no array, and passes over an entry that is
 * not an object.
 */
function* blocksAmong(blocks: unknown): Generator<Record<string, unknown>> {
	if (!Array.isArray(blocks)) {
		return;
	}

	// Written out rather than `isTable`, which the page's copy cannot reach.
	const objects = blocks.filter(
		(block): block is Record<string, unknown> =>
			typeof block === "object" && block !== null && !Array.isArray(block),
	);

	for (const block of objects) {
		yield block;

		if (block["kind"] === "row") {
			yield* blocksAmong(block["blocks"]);
		}

		if (block["kind"] === "fact") {
			yield* blocksAmong(block["evidence"]);
		}
	}
}

/**
 * Walks every block in `step`, at any depth, in the order the page shows
 * them: `afterItLands`, then `proposedChange`, then `reliesOn`.
 */
export function* blocksIn(
	step: Record<string, unknown>,
): Generator<Record<string, unknown>> {
	yield* blocksAmong(step["afterItLands"]);
	yield* blocksAmong(step["proposedChange"]);
	yield* blocksAmong(step["reliesOn"]);
}

/**
 * Walks every block in `plan`, at any depth: the survey's evidence, then each
 * step's blocks.
 *
 * @remarks
 * `plan` may be any parsed JSON; an entry that is not an object is passed
 * over.
 */
export function* blocksOf(
	plan: Record<string, unknown>,
): Generator<Record<string, unknown>> {
	const survey = Array.isArray(plan["survey"]) ? plan["survey"] : [];
	const steps = Array.isArray(plan["steps"]) ? plan["steps"] : [];

	for (const fact of survey.filter(isTable)) {
		yield* blocksAmong(fact["evidence"]);
	}

	for (const step of steps.filter(isTable)) {
		yield* blocksIn(step);
	}
}

/** Lists the places decisions sit: `plan` itself, then each of its steps. */
function decisionHolders(plan: Record<string, unknown>): unknown[] {
	return [plan, ...(Array.isArray(plan["steps"]) ? plan["steps"] : [])];
}

/**
 * Lists the open questions `holder`, a plan or one of its steps, asks itself.
 *
 * @remarks
 * An entry that is not an object is kept, for the checks to report, so a
 * caller that reads an entry's fields filters first.
 */
export function openQuestionsIn(holder: unknown): unknown[] {
	const open = fieldsOf(fieldsOf(holder)["decisions"])["open"];

	return Array.isArray(open) ? open : [];
}

/**
 * Lists the user's decisions `holder`, a plan or one of its steps, records.
 *
 * @remarks
 * An entry that is not an object is kept, as {@link openQuestionsIn} keeps
 * one.
 */
export function userDecisionsIn(holder: unknown): unknown[] {
	const user = fieldsOf(fieldsOf(holder)["decisions"])["user"];

	return Array.isArray(user) ? user : [];
}

/**
 * Lists the proposals `holder`, a plan or one of its steps, makes.
 *
 * @remarks
 * An entry that is not an object is kept, as {@link openQuestionsIn} keeps
 * one.
 */
export function proposalsIn(holder: unknown): unknown[] {
	const proposals = fieldsOf(holder)["proposals"];

	return Array.isArray(proposals) ? proposals : [];
}

/**
 * Lists every open question in `plan`, plan-wide then each step's in order,
 * each list read by {@link openQuestionsIn}.
 */
export function openQuestionsOf(plan: Record<string, unknown>): unknown[] {
	return decisionHolders(plan).flatMap(openQuestionsIn);
}

/**
 * Lists every proposal in `plan`, plan-wide then each step's in order, each
 * list read by {@link proposalsIn}.
 */
export function proposalsOf(plan: Record<string, unknown>): unknown[] {
	return decisionHolders(plan).flatMap(proposalsIn);
}

/**
 * A classic script declaring `blocksAmong` and `blocksIn`, for the page to
 * inline ahead of its own script.
 */
export const BLOCK_WALK_SCRIPT = `"use strict";\n${[blocksAmong, blocksIn].map(String).join("\n\n")}\n`;
