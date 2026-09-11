// Which model the hook input is about, and which configured rows speak to it.
import type { Row } from "./rows.mts";

/** An event this hook runs for: the two whose input can name the model. */
export type HookEvent = "SessionStart" | "PostModelSwitch";

/** Whether Claude Code sent one of the events this hook runs for. */
export const isHookEvent = (name: string): name is HookEvent =>
	name === "SessionStart" || name === "PostModelSwitch";

/** The model a hook run is injecting for. */
export interface ActiveModel {
	/** The id Claude Code uses for the model, such as `claude-opus-5`. */
	readonly id: string;
	/** True when this run's input named the id, false when the record held it. */
	readonly named: boolean;
}

/**
 * The model this run is injecting for, or null when nothing establishes one.
 *
 * @remarks
 * A switch answers with `to_model` alone: the model has just changed, so the
 * id the session recorded before it is stale. A session start carries `model`
 * only sometimes, and one without it falls back to `remembered`.
 *
 * @param input - the hook's JSON input, read for `to_model` or `model`
 * @param remembered - the id this session's last input named, or null
 */
export function modelFor(
	event: HookEvent,
	input: Record<string, unknown>,
	remembered: string | null,
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

	return remembered === null ? null : { id: remembered, named: false };
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
