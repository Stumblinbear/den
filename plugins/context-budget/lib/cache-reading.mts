// What a cache scan reads like: the ways the session can carry on from here,
// priced on one set of figures. `/compact`, each cut point still cached, and
// carrying on unchanged, with what each summarizes away, what it keeps and how
// many turns it takes to pay for itself. What sits above them all closes it.
//
// It prices; it does not choose. Which of them to recommend is the `cut-point`
// skill's call, and the price is only half of that: what the work ahead still
// needs verbatim rules options out before any figure is read.
//
// The cut-point script prints it, and nothing else does: the injected messages
// say the size and send the agent here, so a reading is never older than the
// moment the agent asked for one.
import type { Compaction } from "./compaction.mts";
import { formatTokens } from "./messages.mts";
import { compactCut, paybackTurns, TYPICAL_COMPACT_TAIL } from "./payback.mts";
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
 * costs its whole prefix wherever it lands, so what is left to weigh is the two
 * rows below. Unless a compaction kept prompts verbatim; then the choice is
 * those prompts and nothing newer, and pricing `/compact` beside them would put
 * a figure on the dearer of the two and none on the cheaper.
 *
 * Every opening here speaks only of cut points: an empty list means every
 * prompt a rewind would land on has gone cold, not that the context holds none
 * cached and not that nothing has been sent, since a prompt in flight is both.
 */
function emptyReading(scan: CacheWindow, price: Price): string {
	const compaction = compactionIn(scan);

	if (compaction !== null && compaction.kept.length > 0) {
		return `${header(scan, null)}. ${compactedTo(compaction)}, and there is nothing newer to cut at. ${keptClause(compaction, "")}`;
	}

	const context = scan.contextTokens;
	const whole =
		context === null ? null : wholeContext(scan, context, price.read);
	const rows = whole === null ? [] : [whole.compact, whole.carry];
	const opened = `${header(scan, disclosedRate(price, quotesPayback(rows)))}${
		compaction === null
			? `: ${NO_CUT_POINT}`
			: `. ${compactedTo(compaction)}, and there is nothing newer to cut at.`
	}`;

	return rows.length === 0
		? opened
		: `${opened} ${NO_CUTS_LEAD}\n\n${listing(rows)}`;
}

/**
 * What is true of every prompt the picker still offers once the cache behind
 * them has gone: the rewind is a full read of everything above whichever one
 * the user picks. Stated and left there rather than turned into a
 * recommendation, because what chooses between the two rows under it is what
 * the work ahead still needs verbatim, which no figure here knows.
 */
const NO_CUT_POINT =
	"no cut point is still cached, so a rewind re-reads its whole prefix at full price wherever it lands.";

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
 * The prompts the compaction kept verbatim, which cost the same to rewind to
 * as one another; see the header of `compaction.mts` for why. It says nothing
 * about the prompts sent since: the scan reaches a boundary only when every
 * one of those is still cached.
 */
const keptClause = (compaction: Compaction, since: string): string =>
	`The ${compaction.kept.length === 1 ? "one prompt" : `${compaction.kept.length} prompts`} kept verbatim${since === "" ? "" : ` ${since}`}, from "${compaction.kept[0]}" on, can be rewound to for at most that price.`;

/**
 * What the listed prompts say about the rest of the session: that everything
 * after them is cached as well, and what sits above them (more prompts that
 * have gone cold, or nothing selectable at all). A compaction above them is
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

/** One thing the session can do, and what doing it costs. */
interface Row {
	/** The prompt to select in the picker, or the command to run. */
	readonly head: string;
	/** What it moves and what that comes to, in fields the reading separates. */
	readonly detail: string;
	/** The payback it quotes, and null for a row that quotes none. */
	readonly turns: number | null;
}

/** Whether any row came to a payback figure, which is what a rate governs. */
const quotesPayback = (rows: readonly Row[]): boolean =>
	rows.some((row) => row.turns !== null);

/** The rows as the numbered list the reading prints them as. */
const listing = (rows: readonly Row[]): string =>
	rows
		.flatMap(({ head, detail }, index) => [
			`  ${index + 1}. ${head}`,
			`     ${detail}`,
		])
		.join("\n");

/** What the list holds and in what order, where every option is in it. */
const OPTIONS_LEAD =
	"Options, `/compact` first, the cached cut points oldest first after it, and carrying on last, which every payback is measured against:";

/** The same where the session has no cut point left to weigh them against. */
const NO_CUTS_LEAD =
	"Options, `/compact` and carrying on, which its payback is measured against:";

const cutRow = (prompt: CachedPrompt, turns: number | null): Row => ({
	head: `"${prompt.text}"`,
	detail: `sent ${clock(prompt.sentAt)} | valid until ${clock(prompt.expiresAt)} | ${formatTokens(prompt.prefixTokens)} tokens before it, keeps ${formatTokens(prompt.keptTokens)}${paybackClause(turns)}`,
	turns,
});

/**
 * The `/compact` row: the same arithmetic as a cut, at a line Claude Code
 * draws rather than one the user picks out of the cache. Nothing here expires,
 * since it selects no prompt and needs none cached, so the field the cut rows
 * spend on a lifetime says where its tail figure came from instead.
 *
 * That tail is Claude Code's to size and is never known in advance. A
 * compaction this session has already run is the best evidence there is for
 * what the next one would leave, and what it left is what the request after it
 * wrote back to the cache in one piece, its summary included, which is exactly
 * the term this row prices. The constant stands in wherever there is no such
 * compaction to measure, a rewind summarize's boundary included: that one kept
 * the stretch below a prompt the user picked, so pricing it as a tail would
 * quote the rewind the user has already taken and call it `/compact`.
 */
function compactRow(scan: CacheWindow, context: number, read: number): Row {
	const compaction = compactionIn(scan);
	const measured = compaction?.summarize === "compact" ? compaction : null;
	const tail =
		measured === null
			? {
					tokens: TYPICAL_COMPACT_TAIL,
					from: "tail assumed, none measured here",
				}
			: {
					tokens: measured.postTokens,
					from: `tail from the compaction at ${clock(measured.at)}`,
				};
	const cut = compactCut(context, tail.tokens);
	const turns = paybackTurns(cut, scan.ttl, read);

	return {
		head: "`/compact <focus line>`",
		detail: `${tail.from} | summarizes ${formatTokens(cut.prefixTokens)} tokens, keeps about ${formatTokens(cut.keptTokens)}${paybackClause(turns)}`,
		turns,
	};
}

/**
 * What carrying on costs: the whole context read back, every turn, at the rate
 * the reading is priced by. Per turn rather than over a stretch of them,
 * because it is the base the paybacks above it are counted in turns of and
 * nothing here knows how many turns the work has left.
 */
const carryRow = (context: number, read: number): Row => ({
	head: "carry on",
	detail: `nothing summarized, nothing written back | ${formatTokens(context * read)} tokens a turn, ${formatTokens(context)} of context at the cache read rate`,
	turns: null,
});

/** The two options that are about the whole context rather than a prompt. */
interface WholeContext {
	readonly compact: Row;
	readonly carry: Row;
}

/** Those two, which stand whether or not a cut point is left cached. */
const wholeContext = (
	scan: CacheWindow,
	context: number,
	read: number,
): WholeContext => ({
	compact: compactRow(scan, context, read),
	carry: carryRow(context, read),
});

/**
 * The reading itself: an opening paragraph, the options as numbered rows, and
 * what the rest of the session is, above and below the cut points among them.
 *
 * `pricing` is the price table, and the model it is asked about is the one the
 * scan read off the transcript it is reading, so a reading of another
 * session's transcript is priced by that transcript, not by its caller. Null
 * where there is no table.
 */
export function cacheReading(
	scan: CacheWindow,
	pricing: Pricing | null = null,
): string {
	const price = priceOf(scan, pricing);
	const context = scan.contextTokens;

	// One condition in two spellings: the walk records a prompt only once it
	// has met the turn that priced it, so a scan with no context size has no
	// prompts to list either.
	if (context === null || scan.prompts.length === 0) {
		return emptyReading(scan, price);
	}

	const listed = listedPrompts(scan);
	// Priced before anything is written, since whether the opening line has a
	// rate to disclose turns on whether any row came to a figure.
	const whole = wholeContext(scan, context, price.read);
	const cuts = listed.map((prompt) =>
		cutRow(prompt, paybackTurns(prompt, scan.ttl, price.read)),
	);
	const rows = [whole.compact, ...cuts, whole.carry];
	const rate = disclosedRate(price, quotesPayback(rows));

	if (listed.length === 0) {
		// Nothing was listed, so the rows are the two whole-context ones alone.
		return `${opening(scan, rate)} ${NOTHING_TO_CUT} ${NO_CUTS_LEAD}\n\n${listing(rows)}`;
	}

	// The compaction gets a paragraph of its own: the rows below it are the
	// choice, and it is not one of them.
	const paragraphs = namesCompaction(scan)
		? [opening(scan, rate), OPTIONS_LEAD]
		: [`${opening(scan, rate)} ${OPTIONS_LEAD}`];

	paragraphs.push(listing(rows), cachedRangeClause(scan));

	return paragraphs.join("\n\n");
}
