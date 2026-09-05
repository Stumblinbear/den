// Which model the hook input is about, and which configured rows speak to it.
import { readFileSync } from "node:fs";
import { fieldsOf } from "../lib/fields.mts";
import type { Row } from "./rows.mts";

// The two events that carry a model; any other input is not this hook's
// business.
export type HookEvent = "SessionStart" | "PostModelSwitch";

export const isHookEvent = (name: string): name is HookEvent =>
	name === "SessionStart" || name === "PostModelSwitch";

/** The model the injection is about, and where its id was established from. */
export interface ActiveModel {
	readonly id: string;
	/**
	 * True when the hook input named the id. Only then is it worth recording:
	 * a recalled id is what the record already holds, and a guessed one would
	 * turn a guess into the answer every later run reads back.
	 */
	readonly named: boolean;
}

/**
 * The model the injection is about, or null when it cannot be established.
 *
 * A switch is about where it is going. SessionStart carries `model` only
 * sometimes; without it the model the session last named answers, and only a
 * session that has never named one falls through to the user's settings.json
 * -- a guess that misses project-level settings and aliases like "opus".
 */
export function modelFor(
	event: HookEvent,
	input: Record<string, unknown>,
	remembered: string | null,
	settingsPath: string,
): ActiveModel | null {
	const named = modelId(
		event === "PostModelSwitch" ? input["to_model"] : input["model"],
	);

	if (named !== null) {
		return { id: named, named: true };
	}

	if (event === "PostModelSwitch") {
		return null;
	}

	const id = remembered ?? settingsModel(settingsPath);

	return id === null ? null : { id, named: false };
}

function settingsModel(settingsPath: string): string | null {
	try {
		const settings: unknown = JSON.parse(readFileSync(settingsPath, "utf8"));

		return modelId(fieldsOf(settings)["model"]);
	} catch {
		// No settings file, or one that is not readable JSON, is not this
		// hook's problem to report: it is Claude Code's own file.
		return null;
	}
}

const modelId = (value: unknown): string | null =>
	typeof value === "string" && value !== "" ? value : null;

/**
 * Every row whose key matches the model id, in configuration order. Rows
 * compose rather than the first match winning, so a general rule and a
 * model-specific one both reach the session.
 */
export const matchingRows = (
	rows: readonly Row[],
	model: string,
): readonly Row[] => rows.filter((row) => row.match.test(model));
