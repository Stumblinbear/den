// The UserPromptExpansion hook that starts autonomy when the user types
// `/den:autonomy-start`. It turns autonomy on for the session and adds the
// rules to the context beside the command, whose own skill text is a
// placeholder. See the comment on `PROMPT` in `lib/autonomy.mts` for why.
//
//   autonomy-start <project dir>
//
// A start that fails blocks the command, and the reason the user sees says
// why, so the session never runs on a placeholder believing autonomy is on. A
// failure with a cause the user can fix, an empty project directory or a file
// that could not be written, states that cause. Anything else is den's bug and
// reported as one.
import process from "node:process";
import {
	autonomyPrompt,
	autonomyState,
	startAutonomy,
} from "../lib/autonomy.mts";
import { faults } from "../lib/shared/fault.mts";
import {
	errorCode,
	errorMessage,
	fieldsOf,
	firstLine,
} from "../lib/shared/fields.mts";
import { hookInput } from "../lib/shared/hook-input.mts";

const COMMAND = "den:autonomy-start";

const START_FAULTS = faults("den", "Autonomy did not start");

const RESTART_FAULTS = faults(
	"den",
	"Autonomy did not restart and is still on",
);

/**
 * Added after the rules on a start only, so the user hears that autonomy is on
 * when they start it and not again after each compaction.
 */
const START_CONFIRMATION =
	"\nAutonomy has just started. Open your reply with one sentence telling the user it is on.\n";

/** A start refused for a cause the user can fix, with that cause as its message. */
class StartRefusedError extends Error {}

/**
 * Turns autonomy on for the session in `input` and returns the rules to add,
 * read before anything is written.
 */
function start(input: Record<string, unknown>, project: string): string {
	if (project === "") {
		throw new StartRefusedError("CLAUDE_PROJECT_DIR is empty");
	}

	const prompt = autonomyPrompt();

	try {
		startAutonomy(String(input["session_id"] ?? ""), project);
	} catch (error) {
		// A system error here is a file the start could not write or remove,
		// and Node's message includes the operation and the path.
		if (errorCode(error) !== undefined) {
			throw new StartRefusedError(firstLine(errorMessage(error)), {
				cause: error,
			});
		}

		throw error;
	}

	return prompt + START_CONFIRMATION;
}

/** Whether the session's autonomy reads as on, false where it cannot be read. */
function isOn(session: string): boolean {
	try {
		return autonomyState(session) === "on";
	} catch {
		return false;
	}
}

/**
 * The reason the command is blocked for, when starting threw `error`. A start
 * that fails leaves the state as it was, so a session already on stays on and
 * the reason says so.
 */
function blockReason(error: unknown, session: string): string {
	const stillOn = isOn(session);

	if (error instanceof StartRefusedError) {
		return stillOn
			? `den: autonomy did not restart and is still on: ${error.message}.`
			: `den: autonomy did not start: ${error.message}.`;
	}

	return (stillOn ? RESTART_FAULTS : START_FAULTS).internalFault(error).message;
}

const input = fieldsOf(await hookInput());

if (input["command_name"] === COMMAND) {
	let output: Record<string, unknown>;

	try {
		output = {
			hookSpecificOutput: {
				hookEventName: "UserPromptExpansion",
				additionalContext: start(input, process.argv[2] ?? ""),
			},
		};
	} catch (error) {
		output = {
			decision: "block",
			reason: blockReason(error, String(input["session_id"] ?? "")),
		};
	}

	process.stdout.write(JSON.stringify(output));
}
