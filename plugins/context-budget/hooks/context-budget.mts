// PostToolUse and UserPromptSubmit hook. Measures how full the session's
// context is and injects one message when it crosses a per-model threshold, so
// the agent finishes its task and then recommends `/compact` or a rewind
// summarize.
//
// Subagents are out of scope, as they are short-lived and cannot compact.
import process from "node:process";
import { type Crossing, crossing, type Level } from "../lib/level.mts";
import { type Measured, measure } from "../lib/measure.mts";
import { fill, formatTokens } from "../lib/messages.mts";
import { FAULTS } from "../lib/plugin.mts";
import { updateRecord } from "../lib/session-record.mts";
import {
	loadSettings,
	type NoticeLevel,
	type Settings,
	type Thresholds,
	thresholdsFor,
} from "../lib/settings.mts";
import { runEntry } from "../lib/shared/entry.mts";

const EVENTS: readonly string[] = ["PostToolUse", "UserPromptSubmit"];

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
): Promise<string | null> {
	// Read before any work, so a broken install or a broken config is reported
	// on the session's first hook run rather than whenever the first threshold
	// happens to be crossed.
	const settings = await loadSettings(args);

	if (settings === null) {
		return null;
	}

	const reading = measure(transcript);

	if (reading === null) {
		return null;
	}

	// Reset before any threshold is consulted, so a model with no thresholds is
	// reset too: the context it replaced is gone, and every rung is armed
	// again. Nothing is announced, since what the summary costs is measured on
	// the first turn sent it.
	if (reading.kind === "compacted") {
		recorded(sessionId, transcript, () => RESET);

		return null;
	}

	const limits = thresholdsFor(settings, reading.model);
	const notice = recorded(sessionId, transcript, (told) =>
		limits === null ? null : crossing(told, reading, limits),
	);

	return limits === null || notice === null
		? null
		: injection(event, notice, settings, reading, limits);
}

/**
 * The level this run announces, and null both for a level this session has
 * already heard and for a run with nothing to say about the level. The
 * transcript is written to the record either way.
 *
 * `crossed` is handed the level the session has already been told about, which
 * is only readable under the lock, and answers with where this run leaves it
 * or null to leave it where it is.
 */
function recorded(
	sessionId: string,
	transcript: string,
	crossed: (told: Level) => Crossing | null,
): NoticeLevel | null {
	const level = updateRecord(sessionId, (before) => {
		const now = crossed(before.level);

		return {
			// Written on every run, injected or not. See the header of
			// `session-record.mts` for the reader that depends on it.
			fields: { level: now?.level ?? before.level, transcript },
			result: now?.notice ?? null,
		};
	});

	// A run that could not take the lock announces nothing: whether this
	// crossing is one the session has already heard is in the record, and
	// reading that outside the lock is the thing the lock is there to stop.
	// The record is left as it was, so a later run announces the crossing.
	return level.held ? level.result : null;
}

function injection(
	event: string,
	level: NoticeLevel,
	settings: Settings,
	measured: Measured,
	limits: Thresholds,
): string {
	return JSON.stringify({
		hookSpecificOutput: {
			hookEventName: event,
			additionalContext: fill(settings.messages[level], {
				model: measured.model || "this model",
				tokens: formatTokens(measured.tokens),
				threshold: formatTokens(limits[level]),
			}),
		},
	});
}

// The run itself, last in the file and below every binding it reads: a `const`
// read from here before its own declaration throws a ReferenceError.
await runEntry(FAULTS, async ({ input, session }) => {
	// The main session: a subagent's input names the agent it is for.
	if (input["agent_id"]) {
		return null;
	}

	const event = String(input["hook_event_name"] ?? "");
	const transcript = input["transcript_path"];

	if (
		!EVENTS.includes(event) ||
		session === "" ||
		typeof transcript !== "string" ||
		transcript === ""
	) {
		return null;
	}

	return outcome(event, session, transcript);
});
