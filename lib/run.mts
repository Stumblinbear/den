// One hook run, as both halves of an entry see it: the entry runner builds one
// out of what Claude Code wrote on stdin and hands the same object to the
// entry's own work and to the reporter, so what a fault is recorded against is
// the run that met it, and how the work says it ended is read here by the
// reporter that decides what such an ending proves.

/** One hook run: the fields it was handed, and whose run they are. */
export interface Run {
	readonly input: Record<string, unknown>;
	/**
	 * Empty for input naming no session. Entries that keep per-session state
	 * do nothing with such a run, and a fault about it is reported on every
	 * run, since there is no record to note it in.
	 */
	readonly session: string;
	/**
	 * Which of the plugin's entries this is. A report is listed against it,
	 * because a failure of one entry's own is a failure only that entry
	 * running to the end again says anything about.
	 */
	readonly entry: string;
	/** What Claude Code called this run for, and empty for input naming none. */
	readonly event: string;
	/**
	 * Whether the user's prompt is what started this run. Prompts are what a
	 * standing fault is measured in, and a prompt run is the only run that can
	 * find one gone.
	 */
	readonly prompt: boolean;
}

/**
 * A run that ended before reading the configuration, because the input was not
 * this entry's to act on. Nothing it did or did not meet says anything about a
 * fault the session is living with.
 */
export const LEFT_BEFORE_CONFIG: unique symbol = Symbol("left before config");

/**
 * A run that read the configuration and ended before its own work: there is
 * nothing left to do for this input, or nothing configured to do it with. The
 * file is readable and usable, which is all such a run proves.
 */
export const LEFT_AFTER_CONFIG: unique symbol = Symbol("left after config");

/**
 * How a run ended: the text it has to write, null for a run whose work found
 * nothing to say, or one of the two values above for a run that ended before
 * its work. Text and null both say the work was done, which is what makes the
 * run's silence evidence that a standing fault is over.
 */
export type Done =
	| string
	| null
	| typeof LEFT_BEFORE_CONFIG
	| typeof LEFT_AFTER_CONFIG;
