// Which keyed row governs a subject, for the configuration's thresholds and
// the resume guard's limits, whose rows are keyed by a regular expression over
// a model id or an agent type.
//
// `rowFor` picks the row, `compile` turns a key into its expression, and
// `Keyed` is what every such row carries. Both tables pick a row by the one
// rule here, since a difference between them goes unnoticed until a session is
// measured or guarded against the wrong row.

/** What every keyed row carries, whatever it carries beside it. */
export interface Keyed {
	readonly match: RegExp;
}

/**
 * The first row whose key matches, in the order the rows are written, and null
 * where none does, which is where the caller's own default answers instead.
 */
export function rowFor<Row extends Keyed>(
	rows: readonly Row[],
	subject: string,
): Row | null {
	// An empty subject is not a subject nobody wrote a row for: it is the caller
	// saying it does not know which one this is, and a key that matches
	// everything ('.*', '^', '') would take it and govern by a row chosen for
	// something else. A model id arrives empty from a transcript that says
	// nothing about what it was sent to; an agent type never does, since a
	// resume that records none is a "subagent".
	if (subject === "") {
		return null;
	}

	return rows.find((row) => row.match.test(subject)) ?? null;
}

/** Null for a key that is not the regular expression it is meant to be. */
export function compile(pattern: string): RegExp | null {
	try {
		return new RegExp(pattern);
	} catch {
		return null;
	}
}
