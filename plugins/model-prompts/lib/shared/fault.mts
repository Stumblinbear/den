// What stops a run, and how one plugin words it. A report is one line and the
// user's whole view of the failure, so every report is built in one shape and
// there are no stand-in values behind any of them: an entry that cannot do its
// job says so. `entry.mts` carries the line to the agent, on every run that
// meets the fault.
import { errorMessage, firstLine } from "./fields.mts";

/**
 * What went wrong, in the word the report names it by. `internal` is the
 * plugin's own failure rather than the user's, and is on the same footing as
 * the rest.
 */
export type FaultClass = "parser" | "config" | "internal";

const REPORT_AT = "https://github.com/stumblinbear/den/issues";

/**
 * What a report is owed, carried by the line itself. Claude Code hands the
 * text to the agent and shows the user nothing of it, so a report nobody is
 * asked to pass on is a report nobody reads.
 */
const RELAY = [
	"The user sees none of this. Put it to them in your next reply, with the fix",
	"it names, which is theirs to make. Once they have heard it, say it again",
	"only when the wording changes.",
].join(" ");

/** A run stopped by something the session is told about. */
export class Fault extends Error {}

/**
 * How one plugin words a fault. A report names who is speaking, what is
 * wrong, what does not happen while it stands, and what to do about it.
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
}

/** The fault as the session hears it: the line, and what to do with it. */
export const report = (fault: Fault): string => `${fault.message} ${RELAY}`;

/**
 * @param plugin - the name every one of its reports opens with
 * @param consequence - what this plugin does not do while a fault stands
 */
export function faults(plugin: string, consequence: string): Faults {
	const fault = (
		cls: FaultClass,
		detail: string,
		fix: string,
		cause?: unknown,
	) =>
		new Fault(`${plugin}: ${cls} error: ${detail}. ${consequence}; ${fix}.`, {
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
	};
}
