// Plan loading: `loadPlan` reads a plan file into a `LoadedPlan`, or into the
// reason it holds none.
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { errorMessage, isTable } from "../shared/fields.mts";
import { planProblems } from "./checks.mts";
import { normaliseGitPaths } from "./git-paths.mts";
import { resolveSources, type UnreadSource } from "./sources.mts";

/** A plan read from its file and checked, ready to render. */
export interface LoadedPlan {
	/**
	 * The plan's JSON, every `gitPath` written with `/` and every readable
	 * source read into its block.
	 */
	readonly plan: Record<string, unknown>;
	/** The plan file's name without its extension. */
	readonly name: string;
	/** The plan's title, or its {@link name} where that is missing or empty. */
	readonly title: string;
	/** Each source a code or image block points at that could not be read. */
	readonly unread: UnreadSource[];
	/** The plan's problems, one sentence for each fault. */
	readonly problems: string[];
}

/** A loaded plan, or the reason the file holds none. */
export type PlanLoad = LoadedPlan | { readonly failure: string };

/**
 * Reads the plan in `planFile` and readies it to render.
 *
 * @remarks
 * Fails, with the reason, where the file cannot be read, is not JSON, or
 * holds JSON that is not an object; a plan with problems still loads. The
 * plan file is only read.
 */
export function loadPlan(planFile: string): PlanLoad {
	let source: string;

	try {
		source = readFileSync(planFile, "utf8");
	} catch (error) {
		return { failure: `Cannot read ${planFile}: ${errorMessage(error)}` };
	}

	let plan: unknown;

	try {
		plan = JSON.parse(source);
	} catch (error) {
		return {
			failure: `${planFile} is not valid JSON: ${errorMessage(error)}`,
		};
	}

	if (!isTable(plan)) {
		return { failure: `${planFile} holds no plan: its JSON is not an object.` };
	}

	// Before resolveSources, which reads a `gitPath` with `/` only.
	normaliseGitPaths(plan);

	const unread = resolveSources(plan, planFile);
	const name = basename(planFile, extname(planFile));
	const title =
		typeof plan["title"] === "string" && plan["title"] !== ""
			? plan["title"]
			: name;

	return { plan, name, title, unread, problems: planProblems(plan) };
}
