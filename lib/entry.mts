// What every configured entry does around its own work: read the input Claude
// Code writes on stdin, find the session and the event it is for, and end in
// one of the two ways a hook may end. It writes what it has to say on stdout,
// or it writes one line about why it has nothing to say.
import process from "node:process";
import { Fault, type Faults } from "./fault.mts";
import { isTable } from "./fields.mts";
import { hookInput } from "./hook-input.mts";
import { type Done, LEFT_BEFORE_CONFIG, type Run } from "./run.mts";
import type { Recovery } from "./standing.mts";

/** What an entry does with a run. */
export type Work = (run: Run) => Promise<Done>;

/**
 * One of a plugin's entries as it describes itself: what nothing here can see
 * for itself, because it is settled by the plugin's `hooks.json` rather than
 * by anything on a run's input.
 */
export interface Entry {
	/** Distinct within the plugin: a report is listed against this name. */
	readonly name: string;
	/** The policy this entry's faults are worded and recorded by. */
	readonly faults: Faults;
	/**
	 * The event that is the user's own turn, set by the single entry a plugin
	 * registers on it and left unset by every other. A plugin that set it on
	 * two entries would count every prompt twice, and one that set it on an
	 * entry `hooks.json` does not register on that event would count none.
	 *
	 * Runs of that event are what a standing fault is counted in and the only
	 * runs that can take one back, so what such a run answers with is what the
	 * session is told: `LEFT_BEFORE_CONFIG` takes nothing back,
	 * `LEFT_AFTER_CONFIG` takes back what reading the configuration covers, and
	 * text or null takes back every fault this entry could have met. An entry
	 * answering with the last of those without having done the work would take
	 * back a report nothing had put right.
	 */
	readonly promptEvent?: string;
}

/**
 * Runs one entry. The first fault of a class is reported and exits 1, as does
 * a prompt that finds a listed fault standing for another ten; the runs in
 * between exit 0, so Claude Code does not show it again. Anything else that
 * stops the run is a bug here rather than the user's mistake, and is reported
 * the same way.
 *
 * A prompt run that meets no fault takes back what the session was told about
 * the faults its own work covers, in the field Claude Code shows the user
 * rather than as a hook that failed.
 *
 * Input that is not a JSON object is nothing to act on, so `work` is not run.
 */
export async function runEntry(entry: Entry, work: Work): Promise<void> {
	const faults = entry.faults;
	// Out here because a fault is reported against the run it happened in, and
	// because what a run has to say is written on the way out.
	let run: Run = {
		input: {},
		session: "",
		entry: entry.name,
		event: "",
		prompt: false,
	};
	let done: Done = LEFT_BEFORE_CONFIG;
	let recovery: Recovery = { announced: [], standing: [] };

	try {
		const input = await hookInput();

		if (input !== null) {
			const event = String(input["hook_event_name"] ?? "");

			run = {
				input,
				session: String(input["session_id"] ?? ""),
				entry: entry.name,
				event,
				prompt: event === entry.promptEvent,
			};
			done = await work(run);
		}

		recovery = faults.recovered(run, done);
	} catch (error) {
		const fault = error instanceof Fault ? error : faults.internalFault(error);

		process.exitCode = faults.report(run, fault) ? 1 : 0;
	}

	writeOut(typeof done === "string" ? done : null, recovery);
}

/**
 * Writes what the run has for Claude, what it has for the user, and the exit
 * that decides which of the two Claude Code reads.
 */
function writeOut(output: string | null, recovery: Recovery): void {
	const written = objectIn(output);
	const said = [...recovery.announced, ...recovery.standing];
	// The lines go in the field Claude Code shows the user wherever there is
	// something to carry them: an object the run was writing anyway, or nothing
	// at all and good news to put in its place.
	const carries =
		written !== null || (output === null && recovery.announced.length > 0);
	let write = output;

	if (said.length === 0) {
		// The run's own output is the whole of what it has to write.
	} else if (carries) {
		write = announced(written, said);
	} else {
		// A reminder alone ends the way the first report did: on stderr, with
		// the exit Claude Code shows the user. A run writing text keeps that
		// output and the exit that lets Claude Code read it, since the lines
		// are a repeat of news the session already has and the debug log holds
		// them either way.
		for (const line of said) {
			process.stderr.write(`${line}\n`);
		}

		if (output === null) {
			process.exitCode = 1;
		}
	}

	if (write !== null) {
		// Written on the way out rather than followed by `process.exit`, which
		// can truncate a piped stdout before it has flushed.
		process.stdout.write(write);
	}
}

/**
 * `written` with `said` in the field Claude Code shows the user. A hook writes
 * one JSON object or nothing at all, so a message beside an object is merged
 * into it.
 */
const announced = (
	written: Record<string, unknown> | null,
	said: readonly string[],
): string => JSON.stringify({ ...written, systemMessage: said.join("\n") });

/**
 * What a hook wrote, when it wrote a JSON object. Null for a hook that wrote
 * nothing and for one that wrote text, neither of which has a field to add a
 * message to.
 */
function objectIn(output: string | null): Record<string, unknown> | null {
	if (output === null) {
		return null;
	}

	try {
		const parsed: unknown = JSON.parse(output);

		return isTable(parsed) ? parsed : null;
	} catch {
		return null;
	}
}
