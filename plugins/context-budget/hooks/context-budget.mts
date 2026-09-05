// PostToolUse and UserPromptSubmit hook. Measures how full the session's
// context is and injects one message when it crosses a per-model threshold, so
// the agent finishes its task and then recommends `/compact` or a rewind
// summarize.
//
// Subagents are out of scope, as they are short-lived and cannot compact.
import process from "node:process";
import { runEntry } from "../lib/entry.mts";
import { crossing } from "./level.mts";
import { type Measured, measure } from "./measure.mts";
import { fill, formatTokens } from "./messages.mts";
import { FAULTS } from "./plugin.mts";
import { updateRecord } from "./session-record.mts";
import {
	loadSettings,
	type NoticeLevel,
	type Settings,
	type Thresholds,
	thresholdsFor,
} from "./settings.mts";

const EVENTS: readonly string[] = ["PostToolUse", "UserPromptSubmit"];

const args = process.argv.slice(2);

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

	const measured = measure(transcript);

	if (measured === null) {
		return null;
	}

	const limits = thresholdsFor(settings, measured.model);

	if (limits === null) {
		return null;
	}

	const notice = crossed(sessionId, measured, limits);

	return notice === null
		? null
		: injection(event, notice, settings, measured, limits);
}

/**
 * The level to announce, and null for one this session has already heard.
 *
 * The record is read, changed and written back under its lock, after the
 * measurement rather than around it: the resume guard spends the user's
 * answers in that same record, and reading the level under the lock is also
 * what stops two runs measuring at once from both announcing one crossing.
 */
function crossed(
	sessionId: string,
	measured: Measured,
	limits: Thresholds,
): NoticeLevel | null {
	const level = updateRecord(sessionId, (before) => {
		const now = crossing(before.level, measured, limits);

		return {
			// Null when the level did not move: the record already says this.
			record:
				now.level === before.level ? null : { ...before, level: now.level },
			result: now.notice,
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
// read from here before its own declaration throws a ReferenceError, which the
// runner would report as the bug it is.
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
