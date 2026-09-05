// The ladder the context notice climbs, and whether what a run just measured
// is news to the session. Nothing here reads or writes the record: a run hands
// in the level the session has already been told about and is handed back the
// one it now stands at.
import type { Measured } from "./measure.mts";
import type { NoticeLevel, Thresholds } from "./settings.mts";

export type Level = NoticeLevel | "none";

/** In the order they climb, which is how a rise is told from a fall. */
export const LEVELS: readonly Level[] = ["none", "notice", "urgent"];

/** Where a measurement leaves the session, and what it is worth saying. */
export interface Crossing {
	/** What the session now stands at, whether it rose or fell to get there. */
	readonly level: Level;
	/**
	 * Null when this measurement is not a climb past what the session has
	 * already been told.
	 */
	readonly notice: NoticeLevel | null;
}

/**
 * Only a rise injects, but a fall is still recorded, so the record tracks the
 * context rather than the highest point the session ever reached: a summarize
 * or a compact that takes the level back down leaves every rung above it able
 * to fire again on the next climb.
 */
export function crossing(
	told: Level,
	measured: Measured,
	limits: Thresholds,
): Crossing {
	const level = levelAt(measured.tokens, limits);

	return {
		level,
		notice: level !== "none" && rises(level, told) ? level : null,
	};
}

function levelAt(tokens: number, limits: Thresholds): Level {
	if (tokens >= limits.urgent) {
		return "urgent";
	}

	return tokens >= limits.notice ? "notice" : "none";
}

const rises = (level: Level, over: Level): boolean =>
	LEVELS.indexOf(level) > LEVELS.indexOf(over);
