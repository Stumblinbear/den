// What a cache scan reads like: the cut points still cached, what a cut at
// each of them summarizes away, what it keeps, how many turns it takes to pay
// for itself, and what sits above them.
//
// The cut-point script prints it, and nothing else does: the injected messages
// say the size and send the agent here, so a reading is never older than the
// moment the agent asked for one.
import type { Compaction } from "./compaction.mts";
import { formatTokens } from "./messages.mts";
import { paybackTurns } from "./payback.mts";
import {
	DEFAULT_READ_MULTIPLIER,
	type Pricing,
	readMultiplier,
} from "./pricing.mts";
import type { CachedPrompt, CacheWindow } from "./prompt-cache.mts";

/**
 * A wall-clock time to hand the user: local, 24-hour, no date. Everything
 * quoted here expires within the hour.
 */
const clock = (date: Date): string =>
	`${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

const plural = (n: number, noun: string): string =>
	`${n} ${noun}${n === 1 ? "" : "s"}`;

/** How this reading prices a cut, and whether that rate was a guess. */
interface Price {
	readonly read: number;
	/** True where the transcript named no model, or there was no table to ask. */
	readonly assumed: boolean;
}

const priceOf = (scan: CacheWindow, pricing: Pricing | null): Price => {
	// Null only where there is no table to ask: a model the table has never
	// heard of takes its default.
	const rate = readMultiplier(pricing, scan.model);

	return {
		read: rate ?? DEFAULT_READ_MULTIPLIER,
		assumed: scan.model === "" || rate === null,
	};
};

/**
 * The rate the opening line discloses, or null for a reading that discloses
 * none: an assumed rate is worth a clause only where the reading quotes a
 * figure that rate governs.
 */
const disclosedRate = (price: Price, quotesPayback: boolean): number | null =>
	price.assumed && quotesPayback ? price.read : null;

/**
 * When the reading was taken, which lifetime it is reading against, and the
 * rate it priced the payback figures at where that rate was a guess.
 */
const header = (scan: CacheWindow, rate: number | null): string =>
	`Prompt cache, read at ${clock(scan.at)} (${scan.ttl} lifetime${
		rate === null ? ")" : `, payback at the default ${rate}x cache read)`
	}`;

/** The compaction above the cached prompts, and null where there is none. */
const compactionIn = (scan: CacheWindow): Compaction | null =>
	scan.above.kind === "compaction" ? scan.above.compaction : null;

/**
 * Whether the reading has a compaction to speak of. A boundary that kept
 * prompts verbatim prices them, and that is worth a sentence; one that kept
 * nothing prices only the first prompt of the context, which is no cut point.
 */
const namesCompaction = (scan: CacheWindow): boolean =>
	(compactionIn(scan)?.kept.length ?? 0) > 0;

/**
 * What every reading opens with: the header, and the compaction above the
 * cached range where it kept anything, since that is what prices the prompts
 * the list does not.
 */
function opening(scan: CacheWindow, rate: number | null): string {
	const compaction = compactionIn(scan);

	return compaction !== null && namesCompaction(scan)
		? `${header(scan, rate)}. ${compactedTo(compaction)}. ${keptClause(compaction, "since then")}`
		: `${header(scan, rate)}.`;
}

/**
 * The whole of what there is to say when no cut point is left cached: a rewind
 * costs its whole prefix wherever it lands, which leaves `/compact` -- unless
 * a compaction has already bounded that price, and then the choice is the
 * prompts it kept and nothing newer.
 *
 * Both sentences speak only of cut points: an empty list means every prompt a
 * rewind would land on has gone cold, not that the context holds none cached
 * and not that nothing has been sent -- a prompt in flight is both. Neither
 * quotes a payback, so neither has a rate to disclose.
 */
function emptyReading(scan: CacheWindow): string {
	const compaction = compactionIn(scan);

	if (compaction === null) {
		return `${header(scan, null)}: no cut point is still cached, so any rewind re-reads its whole prefix at full price. Recommend \`/compact <focus line>\` instead.`;
	}

	const kept =
		compaction.kept.length > 0 ? ` ${keptClause(compaction, "")}` : "";

	return `${header(scan, null)}. ${compactedTo(compaction)}, and there is nothing newer to cut at.${kept}`;
}

/**
 * What the whole context comes to when the only prompt a turn has answered is
 * its first: a cut there summarizes nothing, so the list is empty for a reason
 * that is not "the cache has expired". The qualifier counts turns because a
 * prompt in flight is in the context too, and is no cut point.
 */
const NOTHING_TO_CUT =
	"Every prompt in the context is cached; the only one with a turn after it is its first, so there is nothing to cut at yet.";

/**
 * Whether the oldest cached prompt is the first prompt of the current context:
 * the walk reached the start of the file, or a compaction that kept no prompt
 * of its own. A cut there summarizes nothing, so it is no use as a cut point
 * and the whole context is cached by definition.
 */
function opensTheContext(scan: CacheWindow): boolean {
	const compaction = compactionIn(scan);

	return compaction === null
		? scan.above.kind !== "colder"
		: compaction.kept.length === 0;
}

/**
 * When the compaction happened and what it left behind, without the full stop:
 * what follows it is either the prompts it kept or the fact that there is
 * nothing newer to cut at.
 */
const compactedTo = (compaction: Compaction): string =>
	`The session was compacted at ${clock(compaction.at)} down to ${formatTokens(compaction.postTokens)} tokens`;

/**
 * The prompts the compaction kept verbatim. All of them were written to the
 * cache in one piece by the first request after it, so a rewind at any of them
 * is a write of at most what the compaction left behind, and there is nothing
 * to choose between them on price. It says nothing about the prompts sent
 * since: the scan reaches a boundary only when every one of those is still
 * cached.
 */
const keptClause = (compaction: Compaction, since: string): string =>
	`The ${compaction.kept.length === 1 ? "one prompt" : `${compaction.kept.length} prompts`} kept verbatim${since === "" ? "" : ` ${since}`}, from "${compaction.kept[0]}" on, can be rewound to for at most that price.`;

/**
 * What the listed prompts say about the rest of the session: that everything
 * after them is cached as well, and what sits above them -- more prompts that
 * have gone cold, or nothing selectable at all. A compaction above them is
 * priced by its own clause.
 */
function cachedRangeClause(scan: CacheWindow): string {
	if (opensTheContext(scan)) {
		return "Every prompt in the context is cached.";
	}

	return compactionIn(scan) === null
		? "Every prompt after the first is cached too, unless its turn was billed on a shorter lifetime that has run out; every prompt before it is not, and a rewind there re-reads its whole prefix at full price."
		: "Every prompt after the first is cached too, unless its turn was billed on a shorter lifetime that has run out.";
}

/**
 * The prompts worth choosing between, oldest first. Everything newer than the
 * oldest cached prompt is cached too, so a busy hour is dozens of rows that
 * all say the same thing; three across the range are enough to choose between,
 * and the middle one is picked by size rather than by clock so that the choice
 * is spread over the context rather than over the session's idle time.
 */
function listedPrompts(scan: CacheWindow): readonly CachedPrompt[] {
	// The first prompt of the context summarizes nothing, so it is not a cut
	// point, and neither the middle nor the newest may fall back to it.
	const pool = opensTheContext(scan) ? scan.prompts.slice(1) : scan.prompts;
	const oldest = pool[0];
	const newest = pool[pool.length - 1];

	if (oldest === undefined || newest === undefined) {
		return [];
	}

	const halfway = (oldest.prefixTokens + newest.prefixTokens) / 2;
	let middle = oldest;

	for (const prompt of pool) {
		// Strictly closer, walking oldest first: a tie goes to the older.
		if (
			Math.abs(prompt.prefixTokens - halfway) <
			Math.abs(middle.prefixTokens - halfway)
		) {
			middle = prompt;
		}
	}

	const listed: CachedPrompt[] = [];

	for (const prompt of [oldest, middle, newest]) {
		if (!listed.includes(prompt)) {
			listed.push(prompt);
		}
	}

	return listed;
}

/**
 * What a cut at a prompt costs, in the unit the agent can weigh it in against
 * the work still in front of it: the turns it takes to pay for itself. Empty
 * for a prompt there is no such figure for.
 */
const paybackClause = (turns: number | null): string =>
	turns === null ? "" : `, pays back after ${plural(turns, "turn")}`;

const row = (
	prompt: CachedPrompt,
	index: number,
	turns: number | null,
): readonly string[] => [
	`  ${index + 1}. "${prompt.text}"`,
	// What a cut here summarizes away, and what it keeps verbatim above it --
	// which the rewind writes back to the cache at the write price before any
	// of the saving starts.
	`     sent ${clock(prompt.sentAt)} | valid until ${clock(prompt.expiresAt)} | ${formatTokens(prompt.prefixTokens)} tokens before it, keeps ${formatTokens(prompt.keptTokens)}${paybackClause(turns)}`,
];

/**
 * The reading itself: an opening paragraph, the cut points as numbered rows,
 * and what the rest of the session is, above and below them.
 *
 * `pricing` is the price table, and the model it is asked about is the one the
 * scan read off the transcript it is reading -- so a reading of another
 * session's transcript is priced by that transcript, not by its caller. Null
 * where there is no table.
 */
export function cacheReading(
	scan: CacheWindow,
	pricing: Pricing | null = null,
): string {
	const price = priceOf(scan, pricing);

	if (scan.prompts.length === 0) {
		return emptyReading(scan);
	}

	const listed = listedPrompts(scan);

	if (listed.length === 0) {
		return `${opening(scan, null)} ${NOTHING_TO_CUT}`;
	}

	// Priced before anything is written, since whether the opening line has a
	// rate to disclose turns on whether any of these came to a figure.
	const payback = listed.map((prompt) =>
		paybackTurns(prompt, scan.ttl, price.read),
	);
	const rate = disclosedRate(
		price,
		payback.some((turns) => turns !== null),
	);
	const rows = listed.flatMap((prompt, i) =>
		row(prompt, i, payback[i] ?? null),
	);

	// The compaction gets a paragraph of its own: the rows below it are the
	// choice, and it is not one of them.
	const paragraphs = namesCompaction(scan)
		? [opening(scan, rate), "Cached prompts, oldest first:"]
		: [`${opening(scan, rate)} Cached prompts, oldest first:`];

	paragraphs.push(rows.join("\n"), cachedRangeClause(scan));

	return paragraphs.join("\n\n");
}
