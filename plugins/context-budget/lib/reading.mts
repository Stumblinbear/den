// What a cache scan comes to, as data: the ways the session can carry on from
// here, which of them the reading offers, and what each one costs. Every
// decision a reading makes is settled here and every word of it in
// `cache-reading.mts`, so what a reading says can be checked without reading
// prose.
//
// It prices; it does not choose. Which option to recommend is the `cut-point`
// skill's call, and the price is only half of that: what the work ahead still
// needs verbatim rules options out before any figure is read.
import type { Compaction } from "./compaction.mts";
import {
	type Cut,
	cutKeeping,
	paybackRequests,
	TYPICAL_CUT_FLOOR,
} from "./payback.mts";
import {
	DEFAULT_READ_MULTIPLIER,
	type Pricing,
	readMultiplier,
} from "./pricing.mts";
import type { CachedPrompt, CacheWindow } from "./prompt-cache.mts";
import type { CacheTtl } from "./transcript.mts";

/** What every cut leaves behind, and whether that figure was measured. */
export interface Floor {
	readonly tokens: number;
	/**
	 * When the compaction it was measured from ran, and null where no
	 * compaction of this session's own was there to measure, so it was assumed.
	 */
	readonly at: Date | null;
}

/** One thing the session can do, and what doing it costs. */
export type Row =
	| {
			readonly kind: "compact";
			readonly cut: Cut;
			readonly requests: number | null;
	  }
	| {
			readonly kind: "cut";
			readonly prompt: CachedPrompt;
			readonly cut: Cut;
			readonly requests: number | null;
	  }
	| {
			readonly kind: "carry";
			readonly contextTokens: number;
			/** What the whole context costs to read back, once per request. */
			readonly perRequestTokens: number;
	  };

/**
 * Which of the four things a reading has to say. They differ in what there is
 * to choose between, not in wording: `cut-points` has rewinds to weigh against
 * `/compact`, `nothing-to-cut` has a context too young to cut anywhere in,
 * `no-cut-points` has one whose prompts have gone cold, and
 * `compacted-to-boundary` has only the prompts a compaction kept, which cost
 * the same as one another and so are priced by that boundary alone.
 */
export type ReadingKind =
	| "cut-points"
	| "nothing-to-cut"
	| "no-cut-points"
	| "compacted-to-boundary";

export interface Reading {
	readonly kind: ReadingKind;
	/** When the scan was taken, which is what every expiry is judged against. */
	readonly at: Date;
	readonly ttl: CacheTtl;
	/** The floor every row is priced against. */
	readonly floor: Floor;
	/**
	 * The rate the reading discloses, and null where it discloses none: a rate
	 * it had to guess is worth saying only where a row quotes a figure that
	 * rate governs.
	 */
	readonly assumedRate: number | null;
	/** The compaction above the cached prompts, and null where there is none. */
	readonly compaction: Compaction | null;
	/** `/compact` first, the cut points oldest first, carrying on last. */
	readonly rows: readonly Row[];
	/** Whether every prompt of the current context is still cached. */
	readonly everyPromptCached: boolean;
}

/** The compaction above the cached prompts, and null where there is none. */
const compactionIn = (scan: CacheWindow): Compaction | null =>
	scan.above.kind === "compaction" ? scan.above.compaction : null;

/**
 * The floor this reading prices every row at. A compaction this session has
 * already run is the best evidence there is for what the next summary will
 * cost to carry, since what it left is what the request after it wrote back to
 * the cache in one piece. The constant stands in wherever there is none, a
 * rewind summarize's boundary included: that one kept the stretch below a
 * prompt the user picked, so its size is the user's choice and not the floor.
 */
function floorOf(scan: CacheWindow): Floor {
	const compaction = compactionIn(scan);
	const measured = compaction?.summarize === "compact" ? compaction : null;

	return measured === null
		? { tokens: TYPICAL_CUT_FLOOR, at: null }
		: { tokens: measured.postTokens, at: measured.at };
}

/** The rate cached tokens read back at, and whether it had to be guessed. */
interface Rate {
	readonly read: number;
	/** True where the transcript named no model, or there was no table to ask. */
	readonly assumed: boolean;
}

const rateOf = (scan: CacheWindow, pricing: Pricing | null): Rate => {
	// Null only where there is no table to ask: a model the table has never
	// heard of takes its default.
	const rate = readMultiplier(pricing, scan.model);

	return {
		read: rate ?? DEFAULT_READ_MULTIPLIER,
		assumed: scan.model === "" || rate === null,
	};
};

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
 * The two rows that are about the whole context rather than about a prompt.
 * `/compact` keeps the floor and nothing over it, which is what makes it the
 * cheapest cut there is and the one that keeps the least.
 */
function wholeContextRows(
	context: number,
	floor: Floor,
	ttl: CacheTtl,
	read: number,
): { readonly compact: Row; readonly carry: Row } {
	const cut = cutKeeping(context, floor.tokens, 0);

	return {
		compact: {
			kind: "compact",
			cut,
			requests: paybackRequests(cut, ttl, read),
		},
		carry: {
			kind: "carry",
			contextTokens: context,
			perRequestTokens: context * read,
		},
	};
}

/** Whether any row came to a payback figure, which is what a rate governs. */
const quotesPayback = (rows: readonly Row[]): boolean =>
	rows.some((row) => row.kind !== "carry" && row.requests !== null);

/**
 * Which of the four a reading is. An empty list is two different facts: a
 * context whose only prompt is the one it opens with has nothing to cut at
 * yet, and one whose prompts have gone cold has nothing left to cut at, which
 * is the one that costs a full-price read wherever the user lands.
 */
function kindOf(
	atBoundary: boolean,
	hasCuts: boolean,
	scan: CacheWindow,
): ReadingKind {
	if (atBoundary) {
		return "compacted-to-boundary";
	}

	if (hasCuts) {
		return "cut-points";
	}

	// The prompt a running reply answers is left out of the scan, so a context
	// whose only prompt it is arrives with none listed, and is as young as one
	// whose opening prompt is listed.
	const young =
		scan.prompts.length > 0 || (scan.answering && scan.above.kind !== "colder");

	return scan.contextTokens !== null && young
		? "nothing-to-cut"
		: "no-cut-points";
}

/**
 * The reading itself. `pricing` is the price table, and the model it is asked
 * about is the one the scan read off the transcript it is reading, so a
 * reading of another session's transcript is priced by that transcript and not
 * by its caller. Null where there is no table.
 */
export function readingOf(
	scan: CacheWindow,
	pricing: Pricing | null = null,
): Reading {
	const rate = rateOf(scan, pricing);
	const floor = floorOf(scan);
	const compaction = compactionIn(scan);
	const context = scan.contextTokens;

	// One condition in two spellings: the walk records a prompt only once it
	// has met the turn that priced it, so a scan with no context size has no
	// prompts to list either.
	const listed = context === null ? [] : listedPrompts(scan);

	// A boundary that kept prompts verbatim prices them and nothing else does,
	// so where the scan reached one with nothing newer to offer, those prompts
	// are the whole of the choice and no row is priced beside them.
	const atBoundary =
		listed.length === 0 && compaction !== null && compaction.kept.length > 0;

	const whole =
		context === null || atBoundary
			? null
			: wholeContextRows(context, floor, scan.ttl, rate.read);

	const rows: readonly Row[] =
		whole === null || context === null
			? []
			: [
					whole.compact,
					...listed.map((prompt): Row => {
						const cut = cutKeeping(context, floor.tokens, prompt.keptTokens);

						return {
							kind: "cut",
							prompt,
							cut,
							requests: paybackRequests(cut, scan.ttl, rate.read),
						};
					}),
					whole.carry,
				];

	return {
		kind: kindOf(atBoundary, listed.length > 0, scan),
		at: scan.at,
		ttl: scan.ttl,
		floor,
		assumedRate: rate.assumed && quotesPayback(rows) ? rate.read : null,
		compaction,
		rows,
		everyPromptCached: opensTheContext(scan),
	};
}
