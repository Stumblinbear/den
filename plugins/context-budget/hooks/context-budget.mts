// The PostToolUse and UserPromptSubmit hook that measures how full the main
// session's context is and, when it rises past a per-model threshold, injects
// the message configured for that level.
//
// Subagents are out of scope, as they are short-lived and cannot compact.
import process from "node:process";
import { type Crossing, crossing, type Level } from "../lib/level.mts";
import { type Measured, measure } from "../lib/measure.mts";
import { fill, formatTokens } from "../lib/messages.mts";
import { NOTICE_FAULTS } from "../lib/plugin.mts";
import { updateRecord } from "../lib/session-record.mts";
import {
	loadSettings,
	type NoticeLevel,
	type Settings,
	type Thresholds,
	thresholdsFor,
} from "../lib/settings.mts";
import { injected, runEntry } from "../lib/shared/entry.mts";

/**
 * The user's own turn, which `hooks.json` registers this entry on alongside
 * every tool call. A fault is reported on the runs of this event alone.
 */
const PROMPT = "UserPromptSubmit";

const EVENTS: readonly string[] = ["PostToolUse", PROMPT];

const args = process.argv.slice(2);

/** Where a compaction leaves the session. */
const RESET: Crossing = { level: "none", notice: null };

/**
 * What this run injects into the session's context, or null for a run with
 * nothing to say.
 */
async function outcome(
	event: string,
	sessionId: string,
	transcript: string,
	settings: Settings,
): Promise<string | null> {
	const reading = measure(transcript);

	if (reading === null) {
		return null;
	}

	// Reset before any threshold is consulted, so a model with no thresholds is
	// reset too: the context it replaced is gone, and every level is armed
	// again. Nothing is announced, since what the summary costs is measured on
	// the first turn sent it.
	if (reading.kind === "compacted") {
		recorded(sessionId, () => RESET);

		return null;
	}

	const limits = thresholdsFor(settings, reading.model);
	const notice = recorded(sessionId, (told) =>
		limits === null ? null : crossing(told, reading, limits),
	);

	return limits === null || notice === null
		? null
		: injected(event, message(notice, settings, reading, limits));
}

/**
 * The level this run announces, and null for a level the session has already
 * heard, for a run with nothing to announce, and for a run that could not take
 * the record's lock.
 *
 * @remarks
 * `crossed` is handed the level the session was last told about, read under
 * the lock, and answers with where this run leaves it, or null to leave it
 * there. The record is written only when that level changes, a fall included,
 * since a fall lets every level above it announce again.
 */
function recorded(
	sessionId: string,
	crossed: (told: Level) => Crossing | null,
): NoticeLevel | null {
	const level = updateRecord(sessionId, (before) => {
		const now = crossed(before.level);

		return {
			fields:
				now === null || now.level === before.level
					? null
					: { level: now.level },
			result: now?.notice ?? null,
		};
	});

	// A run that could not take the lock announces nothing: whether this
	// crossing is one the session has already heard is in the record, and
	// reading that outside the lock is the thing the lock is there to stop.
	// The record is left as it was, so a later run announces the crossing.
	return level.held ? level.result : null;
}

/** The user's own message for a level, on this run's figures. */
const message = (
	level: NoticeLevel,
	settings: Settings,
	measured: Measured,
	limits: Thresholds,
): string =>
	fill(settings.messages[level], {
		model: measured.model || "this model",
		tokens: formatTokens(measured.tokens),
		threshold: formatTokens(limits[level]),
	});

// The run itself, last in the file and below every binding it reads: a `const`
// read from here before its own declaration throws a ReferenceError.
await runEntry(
	{ faults: NOTICE_FAULTS, promptEvent: PROMPT },
	async ({ input, session, event }) => {
		if (!EVENTS.includes(event) || session === "") {
			return null;
		}

		// Read before this run decides anything else, so that a broken install or
		// a broken config is reported on the session's first hook run rather than
		// whenever the first threshold happens to be crossed, and so that every
		// prompt run meets a fault that stands whatever else its input says.
		const settings = await loadSettings(args);

		// The main session: a subagent's input names the agent it is for.
		if (settings === null || input["agent_id"]) {
			return null;
		}

		const transcript = input["transcript_path"];

		if (typeof transcript !== "string" || transcript === "") {
			return null;
		}

		return outcome(event, session, transcript, settings);
	},
);
