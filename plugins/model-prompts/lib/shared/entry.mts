// What every configured entry does around its own work: read the input Claude
// Code writes on stdin, find the session and the event it is for, and write
// what it has for the agent. A run stopped by a fault writes the report of it
// in that same place, since a failed hook's stderr is folded away in the
// transcript where nobody reads it.
import process from "node:process";
import { Fault, type Faults, report } from "./fault.mts";
import { hookInput } from "./hook-input.mts";

/** One hook run: the fields Claude Code handed it. */
export interface Run {
	readonly input: Record<string, unknown>;
	/**
	 * Empty for input naming no session. Entries that keep per-session state
	 * do nothing with such a run.
	 */
	readonly session: string;
	/** What Claude Code called this run for, and empty for input naming none. */
	readonly event: string;
}

/** The text a run has to write, and null for a run with nothing to say. */
export type Done = string | null;

/** What an entry does with a run. */
export type Work = (run: Run) => Promise<Done>;

/**
 * One of a plugin's entries as it describes itself: what nothing here can see
 * for itself, because it is settled by the plugin's `hooks.json` rather than
 * by anything on a run's input.
 */
export interface Entry {
	/** The policy this entry's faults are worded by. */
	readonly faults: Faults;
	/**
	 * The event that is the user's own turn, named by an entry that Claude
	 * Code also calls many times inside one turn. A fault is reported on runs
	 * of that event alone, since the same line on every tool call is a line
	 * nobody reads; an entry that names no event reports on every run it makes.
	 */
	readonly promptEvent?: string;
}

/**
 * Runs one entry, and writes the one thing it has to say: its own work's
 * output, or the report of the fault that stopped it. A fault is reported for
 * as long as it stands, on the runs `heard` lets it out of, because nothing
 * here can see whether the user has read anything and a plugin has nowhere on
 * the screen to keep a standing indicator. Anything that stops the run without
 * being raised as a fault is a bug here rather than the user's mistake, and is
 * reported the same way.
 *
 * Input that is not a JSON object is nothing to act on, so `work` is not run.
 */
export async function runEntry(entry: Entry, work: Work): Promise<void> {
	// Out here because a fault is reported against the run that met it, and
	// because what a run has to say is written on the way out.
	let run: Run = { input: {}, session: "", event: "" };
	let write: Done = null;

	try {
		const input = await hookInput();

		if (input !== null) {
			run = {
				input,
				session: String(input["session_id"] ?? ""),
				event: String(input["hook_event_name"] ?? ""),
			};
			write = await work(run);
		}
	} catch (error) {
		const fault =
			error instanceof Fault ? error : entry.faults.internalFault(error);

		write = heard(entry, run) ? injected(run.event, report(fault)) : null;
	}

	if (write !== null) {
		// Written on the way out rather than followed by `process.exit`, which
		// can truncate a piped stdout before it has flushed.
		process.stdout.write(write);
	}
}

/**
 * Whether a fault this run met is one the session hears about. A fault of the
 * file or the parser that a quiet run meets is one the turn's own run meets
 * too, since every entry reads its configuration before it decides anything
 * else. An `internal` fault met on a quiet run is dropped, which an entry
 * doing the same work on every event it runs on can afford: a bug that stops
 * a tool call stops the turn's own run too, and is reported there. What the
 * gap holds is a run stopped by the state of its moment, the filesystem under
 * the record or the transcript as it stands, and the next run to meet that
 * state reports it.
 */
const heard = (entry: Entry, run: Run): boolean =>
	entry.promptEvent === undefined || run.event === entry.promptEvent;

/**
 * Text as Claude Code carries it to the agent: one JSON object on stdout.
 * `additionalContext` reaches the agent on every event these plugins are
 * registered on, which plain stdout does not, and it reaches it from the async
 * entry too. Claude Code reads it against the event the run was called for, so
 * `event` is the run's own.
 */
export const injected = (event: string, text: string): string =>
	JSON.stringify({
		hookSpecificOutput: { hookEventName: event, additionalContext: text },
	});
