// What every configured entry does around its own work: read the input Claude
// Code writes on stdin, find the session it is for, and end in one of the two
// ways a hook may end -- what it has to say on stdout, or one line about why
// it has nothing to say and will not have for the rest of the session.
import process from "node:process";
import { Fault, type Faults } from "./fault.mts";
import { hookInput } from "./hook-input.mts";

/** One hook run: the fields it was handed, and the session they are about. */
export interface Run {
	readonly input: Record<string, unknown>;
	/**
	 * Empty for input naming no session. Entries that keep per-session state
	 * do nothing with such a run; the empty name is still what a fault about
	 * it is marked by, so a report is never lost for want of a session.
	 */
	readonly session: string;
}

/** What an entry does with a run: the text to write, or null for nothing. */
export type Work = (run: Run) => Promise<string | null>;

/**
 * Runs one entry. The first fault of a class is reported and exits 1; a later
 * one of that class exits 0, so Claude Code does not show it again. Anything
 * else that stops the run is a bug here rather than the user's mistake, and is
 * reported the same way.
 *
 * Input that is not a JSON object is nothing to act on, so `work` is not run.
 */
export async function runEntry(faults: Faults, work: Work): Promise<void> {
	// Out here because a fault is reported against the session it happened in,
	// and because what a run has to say is written on the way out.
	let session = "";
	let output: string | null = null;

	try {
		const input = await hookInput();

		if (input !== null) {
			session = String(input["session_id"] ?? "");
			output = await work({ input, session });
		}
	} catch (error) {
		const fault = error instanceof Fault ? error : faults.internalFault(error);

		process.exitCode = faults.reportOnce(session, fault) ? 1 : 0;
	}

	if (output !== null) {
		// Written on the way out rather than followed by `process.exit`, which
		// can truncate a piped stdout before it has flushed.
		process.stdout.write(output);
	}
}
