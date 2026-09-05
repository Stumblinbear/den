// What a transcript's entries mean, for the three readers that have to agree
// about it: the measurement hook, the resume guard and the cache scan. Each of
// them asks the same questions -- how big was the context, which cache
// lifetime was it written under, and is this the point where the context was
// thrown away -- so the answers live here once rather than three times over.
//
// A transcript's lines are whatever Claude Code wrote, and a line may be
// half-written while the file is being appended to, so every entry and every
// field is narrowed on the way out rather than trusted.
import { errorCode, fieldsOf, isTable } from "./shared/fields.mts";

/** The prompt-cache lifetime a turn was billed under, as a message names it. */
export type CacheTtl = "5m" | "1h";

/** Used where no turn a reader can see recorded a split at all. */
export const DEFAULT_TTL: CacheTtl = "5m";

const LIFETIME_MS: Readonly<Record<CacheTtl, number>> = {
	"5m": 5 * 60_000,
	"1h": 60 * 60_000,
};

export const lifetimeMs = (ttl: CacheTtl): number => LIFETIME_MS[ttl];

/** The longest lifetime any turn could have been billed on. */
export const LONGEST_LIFETIME_MS = Math.max(...Object.values(LIFETIME_MS));

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

/** A token count as an entry spells it, and 0 for anything that is not one. */
const count = (value: unknown): number =>
	typeof value === "number" && Number.isFinite(value) ? value : 0;

/**
 * The context an assistant turn was sent: its prompt, what it wrote to the
 * cache, and what it read back from there. The three together are the whole
 * input, whatever the split between them happened to be.
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
 * The usage of a turn that was really taken, or null. A request that failed
 * before the model saw it is written as an assistant entry of its own, with
 * every usage field zero, and is a turn to none of these readers.
 */
export function turnUsage(
	entry: Record<string, unknown>,
): Record<string, unknown> | null {
	const usage = fieldsOf(entry["message"])["usage"];

	return isTable(usage) && inputTokens(usage) > 0 ? usage : null;
}

/**
 * The model id a turn was sent to, as the transcript records it
 * ("claude-opus-5"), and the empty string for a turn that records none: a
 * transcript saying nothing about what it was sent to, which is not a model
 * nobody has written a row for.
 */
export const turnModel = (entry: Record<string, unknown>): string =>
	String(fieldsOf(entry["message"])["model"] ?? "");

/**
 * The lifetime the turn's request wrote the cache under, from the split it was
 * billed in, or null when it wrote nothing at all. A request served entirely
 * from a warm cache is that null: it refreshed an entry another request wrote,
 * and refreshing one does not extend it, so it says nothing about how long
 * that entry lives.
 */
export function cacheLifetime(usage: unknown): CacheTtl | null {
	const created = fieldsOf(fieldsOf(usage)["cache_creation"]);

	if (count(created["ephemeral_1h_input_tokens"]) > 0) {
		return "1h";
	}

	return count(created["ephemeral_5m_input_tokens"]) > 0 ? "5m" : null;
}

/**
 * Where the context was replaced by a summary of itself. `/compact`,
 * auto-compact and both rewind summarize directions each append a
 * `compact_boundary` system entry followed by an `isCompactSummary` user
 * entry, so either one alone is enough to recognise it. Nothing above it is in
 * the current context.
 */
export const isCompaction = (entry: Record<string, unknown>): boolean =>
	(entry["type"] === "system" && entry["subtype"] === "compact_boundary") ||
	(entry["type"] === "user" && entry["isCompactSummary"] === true);

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
		const entry = entryIn(lines[i]);

		if (entry !== null) {
			yield entry;
		}
	}
}

/** The entry a line spells, and null for a line that spells none. */
export function entryIn(
	line: string | undefined,
): Record<string, unknown> | null {
	if (!line) {
		return null;
	}

	let entry: unknown;

	try {
		entry = JSON.parse(line);
	} catch {
		return null;
	}

	return isTable(entry) ? entry : null;
}
