// Reading a transcript. Its lines are whatever Claude Code wrote, and a line
// may be half-written while the file is being appended to, so every entry and
// every field is narrowed on the way out rather than trusted.
import { errorCode, fieldsOf, isTable } from "../lib/fields.mts";

/**
 * What `read` came back with, and null for a transcript that is not at the
 * path it was named at. Claude Code names the path a hook reads, and one it
 * names is not always there -- a session whose transcript has been moved or
 * deleted has nothing to measure and nothing to inspect, which is neither the
 * user's mistake nor this plugin's bug.
 *
 * Every other read error is left to stop the run: a file that is there and
 * will not be read is not an absent one, and nothing here can tell what it is.
 */
export function ifPresent<T>(read: () => T): T | null {
	try {
		return read();
	} catch (error) {
		if (errorCode(error) === "ENOENT") {
			return null;
		}

		throw error;
	}
}

export const count = (value: unknown): number =>
	typeof value === "number" && Number.isFinite(value) ? value : 0;

/**
 * The context an assistant turn was sent: its prompt, what it wrote to the
 * cache, and what it read back from there.
 */
export const inputTokens = (usage: unknown): number => {
	const fields = fieldsOf(usage);

	return (
		count(fields["input_tokens"]) +
		count(fields["cache_creation_input_tokens"]) +
		count(fields["cache_read_input_tokens"])
	);
};

/**
 * The transcript's entries from the newest back, skipping anything that is not
 * a JSON object.
 *
 * @param first - the earliest line to trust. A tail that starts mid-file also
 *   starts mid-line, and that first fragment is not a whole entry.
 */
export function* newestFirst(
	lines: readonly string[],
	first = 0,
): Generator<Record<string, unknown>> {
	for (let i = lines.length - 1; i >= first; i--) {
		const line = lines[i];

		if (!line) {
			continue;
		}

		let entry: unknown;

		try {
			entry = JSON.parse(line);
		} catch {
			continue;
		}

		if (isTable(entry)) {
			yield entry;
		}
	}
}
