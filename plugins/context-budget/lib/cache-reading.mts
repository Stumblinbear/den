// What a reading reads like. Every word the cut-point script prints is here
// and every decision behind those words is in `reading.mts`, so a wording
// change moves this file alone.
//
// The output is read as prose by an agent with no other view of the session,
// so each row says what it moves before what it costs: what the work ahead
// still needs verbatim rules an option out before any figure is weighed.
import type { Compaction } from "./compaction.mts";
import { formatTokens } from "./messages.mts";
import type { Pricing } from "./pricing.mts";
import type { CacheWindow } from "./prompt-cache.mts";
import { type Floor, type Reading, type Row, readingOf } from "./reading.mts";

/**
 * A wall-clock time to hand the user: local, 24-hour, no date. Everything
 * quoted here expires within the hour.
 */
const clock = (date: Date): string =>
	`${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

const plural = (n: number, noun: string): string =>
	`${n} ${noun}${n === 1 ? "" : "s"}`;

/**
 * When the reading was taken, which lifetime it is reading against, and the
 * rate it priced the payback figures at where that rate was a guess.
 */
const header = (reading: Reading): string =>
	`Prompt cache, read at ${clock(reading.at)} (${reading.ttl} lifetime${
		reading.assumedRate === null
			? ")"
			: `, payback at the default ${reading.assumedRate}x cache read)`
	}`;

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

/** What the list holds and in what order, where every option is in it. */
const OPTIONS_LEAD =
	"Options, `/compact` first, the cached cut points oldest first after it, and carrying on last, which every payback is measured against:";

/** The same where the session has no cut point left to weigh them against. */
const NO_CUTS_LEAD =
	"Options, `/compact` and carrying on, which its payback is measured against:";

/**
 * What the listed prompts say about the rest of the session: that everything
 * after them is cached as well, and what sits above them (more prompts that
 * have gone cold, or nothing selectable at all). A compaction above them is
 * priced by its own clause.
 */
function cachedRangeClause(reading: Reading): string {
	if (reading.everyPromptCached) {
		return "Every prompt in the context is cached.";
	}

	return reading.compaction === null
		? "Every prompt after the first is cached too, unless its turn was billed on a shorter lifetime that has run out; every prompt before it is not, and a rewind there re-reads its whole prefix at full price."
		: "Every prompt after the first is cached too, unless its turn was billed on a shorter lifetime that has run out.";
}

/**
 * What a cut costs, in the unit the agent can weigh it in against the work
 * still in front of it: the requests it takes to pay for itself, one per model
 * call, so a single prompt with tool calls in its reply is several.
 *
 * A cut that would leave more than the context already holds has no payback to
 * quote, because it saves nothing: the floor plus the stretch it keeps comes
 * to more than carrying on re-reads. That is the one thing worth saying about
 * such a cut, so it is said in the same field.
 */
const paybackClause = (requests: number | null): string =>
	requests === null
		? ", leaves more than the context holds: no saving"
		: `, pays back after ${plural(requests, "request")}`;

/**
 * Where the floor came from. Nothing about `/compact` expires, since it
 * selects no prompt and needs none cached, so the field the cut rows spend on
 * a lifetime says this instead.
 */
const floorFrom = (floor: Floor): string =>
	floor.at === null
		? "floor assumed, none measured here"
		: `floor from the compaction at ${clock(floor.at)}`;

/** The prompt to select in the picker, or the command to run. */
function head(row: Row): string {
	switch (row.kind) {
		case "compact":
			return "`/compact [focus]`";

		case "cut":
			return `"${row.prompt.text}"`;

		case "carry":
			return "carry on";
	}
}

/**
 * What the row moves and what that comes to. The stretch a cut keeps verbatim
 * leads, because that is what the arc rules on, and the floor beside it is why
 * a deep cut point can cost more than `/compact` while writing the same
 * summary.
 */
function detail(row: Row, floor: Floor): string {
	switch (row.kind) {
		case "compact":
			return `${floorFrom(floor)} | keeps the ${formatTokens(row.cut.keptTokens)} floor and no more, summarizes ${formatTokens(row.cut.prefixTokens)}${paybackClause(row.requests)}`;

		case "cut":
			return `sent ${clock(row.prompt.sentAt)} | valid until ${clock(row.prompt.expiresAt)} | keeps ${formatTokens(row.prompt.keptTokens)} verbatim over a ${formatTokens(floor.tokens)} floor, summarizes ${formatTokens(row.cut.prefixTokens)}${paybackClause(row.requests)}`;

		case "carry":
			return `nothing summarized, nothing written back | ${formatTokens(row.perRequestTokens)} tokens a request, ${formatTokens(row.contextTokens)} of context at the cache read rate`;
	}
}

/** The rows as the numbered list the reading prints them as. */
const listing = (reading: Reading): string =>
	reading.rows
		.flatMap((row, index) => [
			`  ${index + 1}. ${head(row)}`,
			`     ${detail(row, reading.floor)}`,
		])
		.join("\n");

/**
 * What a reading with rows opens with: the header, and the compaction above
 * the cached range where it kept anything, since that is what prices the
 * prompts the list does not.
 */
function opening(reading: Reading): string {
	const compaction = reading.compaction;

	return compaction !== null && compaction.kept.length > 0
		? `${header(reading)}. ${compactedTo(compaction)}. ${keptClause(compaction, "since then")}`
		: `${header(reading)}.`;
}

/** The paragraphs a reading with rows to offer comes to. */
const withRows = (reading: Reading, opened: string, lead: string): string =>
	`${opened} ${lead}\n\n${listing(reading)}`;

/** Every word of one reading. */
export function formatReading(reading: Reading): string {
	const compaction = reading.compaction;

	switch (reading.kind) {
		case "compacted-to-boundary":
			// Null cannot reach here: this is the reading a boundary that kept
			// prompts gives, and nothing else is that kind.
			return compaction === null
				? `${header(reading)}.`
				: `${header(reading)}. ${compactedTo(compaction)}, and there is nothing newer to cut at. ${keptClause(compaction, "")}`;

		case "no-cut-points": {
			const opened = `${header(reading)}${
				compaction === null
					? `: ${NO_CUT_POINT}`
					: `. ${compactedTo(compaction)}, and there is nothing newer to cut at.`
			}`;

			return reading.rows.length === 0
				? opened
				: withRows(reading, opened, NO_CUTS_LEAD);
		}

		case "nothing-to-cut":
			return withRows(
				reading,
				`${opening(reading)} ${NOTHING_TO_CUT}`,
				NO_CUTS_LEAD,
			);

		case "cut-points": {
			// The compaction gets a paragraph of its own: the rows below it are
			// the choice, and it is not one of them.
			const paragraphs =
				compaction !== null && compaction.kept.length > 0
					? [opening(reading), OPTIONS_LEAD]
					: [`${opening(reading)} ${OPTIONS_LEAD}`];

			paragraphs.push(listing(reading), cachedRangeClause(reading));

			return paragraphs.join("\n\n");
		}
	}
}

/**
 * The reading of one scan, as the cut-point script prints it. `pricing` is the
 * price table, and null where there is none.
 */
export const cacheReading = (
	scan: CacheWindow,
	pricing: Pricing | null = null,
): string => formatReading(readingOf(scan, pricing));
