// The result a UserPromptSubmit hook hands Claude Code: context for the lead,
// a line for the user, or both. `PromptOutput` holds what one run has, and
// `writePromptOutput` writes it.
import process from "node:process";

/** What one UserPromptSubmit run has for the lead and for the user. */
export interface PromptOutput {
	/** Context the lead reads with the prompt. */
	readonly reminder?: string;
	/** A fault line the user sees and the lead does not. */
	readonly fault?: string;
}

/**
 * Writes `output` to stdout as the hook's UserPromptSubmit result.
 *
 * @remarks
 * The result is the whole of the hook's output, so a run calls this once, and
 * only from UserPromptSubmit. An output with neither field writes nothing.
 */
export function writePromptOutput(output: PromptOutput): void {
	if (output.reminder === undefined && output.fault === undefined) {
		return;
	}

	process.stdout.write(
		JSON.stringify({
			...(output.fault === undefined ? {} : { systemMessage: output.fault }),
			...(output.reminder === undefined
				? {}
				: {
						hookSpecificOutput: {
							hookEventName: "UserPromptSubmit",
							additionalContext: output.reminder,
						},
					}),
		}),
	);
}
