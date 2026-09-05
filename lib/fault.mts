// What stops a run, and the once-per-session report that stands in place of
// any recovery. There are no stand-in values: an entry that cannot do its job
// says so, once, and then leaves the session alone.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import process from "node:process";
import { errorMessage, firstLine } from "./fields.mts";
import type { SessionState } from "./session-state.mts";

/**
 * What went wrong, which is also what the report is marked by: a class already
 * reported is one this session hears nothing more about. `internal` is the
 * plugin's own failure rather than the user's, and is on the same footing as
 * the rest so that a crash is said once and never on every run after it.
 */
export type FaultClass = "parser" | "config" | "internal";

const REPORT_AT = "https://github.com/stumblinbear/den/issues";

export interface FaultOptions extends ErrorOptions {
	/** Which report marker silences this fault for the rest of the session. */
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
	 * has already been told. The marker outlives the process, so every run of
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
		new Fault(`${plugin}: ${cls} error -- ${detail}. ${consequence}; ${fix}.`, {
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

function reportOnce(
	state: SessionState,
	sessionId: string,
	fault: Fault,
): boolean {
	const marker = state.file(sessionId, fault.cls);

	if (existsSync(marker)) {
		return false;
	}

	try {
		mkdirSync(state.dir, { recursive: true });
		writeFileSync(marker, new Date().toISOString());
	} catch {
		// A temp directory that cannot be written costs the silence, not the
		// report: saying it every time beats never saying it.
	}

	process.stderr.write(`${fault.message}\n`);

	return true;
}
