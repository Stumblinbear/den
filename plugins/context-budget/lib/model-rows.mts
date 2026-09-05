// Which per-model row governs a model id. The configuration's thresholds and
// the price table's read rates are both keyed by a regular expression on the
// id the transcript records, and they say entirely different things, but they
// resolve a row the same way -- and a difference in which row wins is one
// nobody notices until a session is measured or priced against the wrong one.

/** What every keyed row carries, whatever it carries beside it. */
export interface ModelMatch {
	readonly match: RegExp;
}

/**
 * The first row whose key matches, in the order the rows are written, and null
 * where none does -- which is where the caller's own default answers instead.
 */
export function rowFor<Row extends ModelMatch>(
	rows: readonly Row[],
	model: string,
): Row | null {
	// An empty model id is not a model: it is a transcript that says nothing
	// about what it was sent to, and nobody writes a row for that. Matched
	// against the rows, a key that matches everything -- '.*', '^', '' -- takes
	// it.
	if (model === "") {
		return null;
	}

	return rows.find((row) => row.match.test(model)) ?? null;
}

/** Null for a key that is not the regular expression it is meant to be. */
export function compile(pattern: string): RegExp | null {
	try {
		return new RegExp(pattern);
	} catch {
		return null;
	}
}
