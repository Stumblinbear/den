// What stops a run, and the once-per-session report that stands in place of
// any recovery. There are no stand-in values: an entry that cannot do its job
// says so, once, and then leaves the session alone.
import process from "node:process";
import { errorMessage, firstLine } from "./fields.mts";
import type { SessionState } from "./session-state.mts";

/**
 * What went wrong, and what the record lists once it is said: a class already
 * reported is one this session hears nothing more about. `internal` is the
 * plugin's own failure rather than the user's, and is on the same footing as
 * the rest so that a crash is said once and never on every run after it.
 */
export type FaultClass = "parser" | "config" | "internal";

const REPORT_AT = "https://github.com/stumblinbear/den/issues";

export interface FaultOptions extends ErrorOptions {
	/** Which class the session's record lists once this has been said. */
	readonly cls: FaultClass;
}

export class Fault extends Error {
	readonly cls: FaultClass;

	constructor(text: string, options: FaultOptions) {
		super(text, options);
		this.cls = options.cls;
	}
}

/**
 * How one plugin words a fault and where it marks having said it. A report is
 * one line and the user's whole view of the failure, so it is built in one
 * shape: who is speaking, what is wrong, what does not happen while it stands,
 * and what to do about it.
 */
export interface Faults {
	fault(cls: FaultClass, detail: string, fix: string, cause?: unknown): Fault;
	/** The same for a configuration file that cannot be read or used. */
	configFault(path: string, detail: string, cause?: unknown): Fault;
	/**
	 * The same for anything that stopped a run without being raised as a
	 * fault: a bug here, which the user can do nothing about but report.
	 */
	internalFault(cause: unknown): Fault;
	/**
	 * One report per class per session, then silence: false says this session
	 * has already been told. The record outlives the process, so every run of
	 * one session counts as one session, whichever entry gets there first.
	 */
	reportOnce(sessionId: string, fault: Fault): boolean;
}

/**
 * @param plugin - the name every one of its reports opens with
 * @param consequence - what this plugin does not do while a fault stands
 */
export function faults(
	plugin: string,
	consequence: string,
	state: SessionState,
): Faults {
	const fault = (
		cls: FaultClass,
		detail: string,
		fix: string,
		cause?: unknown,
	) =>
		new Fault(`${plugin}: ${cls} error: ${detail}. ${consequence}; ${fix}.`, {
			cls,
			cause,
		});

	return {
		fault,
		configFault: (path, detail, cause) =>
			fault("config", `${path} ${detail}`, "fix or delete that file", cause),
		internalFault: (cause) =>
			fault(
				"internal",
				firstLine(errorMessage(cause)) || "no message",
				`report it at ${REPORT_AT}`,
				cause,
			),
		reportOnce: (sessionId, reported) => reportOnce(state, sessionId, reported),
	};
}

/**
 * The classes this session has already been told about, listed in its record.
 * The plugin's own fields share that record, so anything that is not a list of
 * names reads as an empty one.
 */
const REPORTED = "reported";

function reportOnce(
	state: SessionState,
	sessionId: string,
	fault: Fault,
): boolean {
	// No session id is no session to record against: one record shared by every
	// such run on the machine would silence all but the first of them.
	if (sessionId !== "") {
		// Whether the class is listed and the listing of it are one step under
		// the record's lock, since two hooks of one session run at once.
		const first = state.update(sessionId, (record) => {
			const listed = reportedIn(record);

			return listed.includes(fault.cls)
				? { fields: null, result: false }
				: { fields: { [REPORTED]: [...listed, fault.cls] }, result: true };
		});

		// A run that never got the lock has no answer to go on, and one whose
		// write did not land has an answer nothing kept: either way what is
		// lost is the silence, and saying it every time beats never saying it.
		if (first.held && !first.result) {
			return false;
		}
	}

	process.stderr.write(`${fault.message}\n`);

	return true;
}

function reportedIn(record: Record<string, unknown>): readonly string[] {
	const listed = record[REPORTED];

	return Array.isArray(listed)
		? listed.filter((cls): cls is string => typeof cls === "string")
		: [];
}
