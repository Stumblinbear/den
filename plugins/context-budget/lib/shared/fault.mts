// What stops a run, and how one plugin words it. A report is one line and the
// user's whole view of the failure, so every report is built in one shape and
// there are no stand-in values behind any of them: an entry that cannot do its
// job says so. How long the session goes on hearing it, and what it takes to
// hear that it is over, is `standing.mts`.
import { errorMessage, firstLine } from "./fields.mts";
import type { Done, Run } from "./run.mts";
import type { SessionState } from "./session-state.mts";
import { type Recovery, recovered, report } from "./standing.mts";

/**
 * What went wrong, and what the record lists while it stands: a fault already
 * reported is one this session hears again only on the tenth prompt it has
 * stood through, the twentieth, and so on. `internal` is the plugin's own
 * failure rather than the user's, and is on the same footing as the rest.
 */
export type FaultClass = "parser" | "config" | "internal";

const REPORT_AT = "https://github.com/stumblinbear/den/issues";

export interface FaultOptions extends ErrorOptions {
	/** Which class the session's record lists while this stands. */
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
 * How one plugin words a fault and where it marks having said it. A report
 * names who is speaking, what is wrong, what does not happen while it stands,
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
	 * Says the fault and whatever else has stood another ten prompts, or
	 * leaves the session alone: false says nothing was written. A fault the
	 * session has already been told about in these words is left to the
	 * reminders.
	 *
	 * The record outlives the process, so every run of one session counts as
	 * one session, whichever entry gets there first.
	 */
	report(run: Run, fault: Fault): boolean;
	/**
	 * What a run that met no fault has for the user. Called by every such run;
	 * only a prompt run answers with anything.
	 *
	 * A fault is taken back only by a run whose own work covers it, which is
	 * what `reached` says: how far the entry got before it ended, and so what
	 * its silence is evidence about.
	 */
	recovered(run: Run, reached: Done): Recovery;
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
		report: (run, reported) => report(state, run, reported),
		recovered: (run, reached) => recovered(state, plugin, run, reached),
	};
}
