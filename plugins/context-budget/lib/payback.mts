// What a cut costs and what it pays back: the write it pays now, the summary
// it writes, and the per-request read they buy back. The rate those reads are
// priced at is the one term of the three that varies by model, so it comes in
// from the price table rather than living here.
//
// The summary is two costs and not one: `SUMMARY_TOKENS` to generate it, once,
// and `TYPICAL_CUT_FLOOR` to carry it, on every request after the cut. Only
// the second is a term a deeper cut cannot shrink.
//
// A cut is a rewind at a prompt or a `/compact`, and the arithmetic cannot
// tell them apart: both summarize a prefix away and write the rest back. All
// that differs is where the line falls, which the caller knows and this file
// does not.
import type { CacheTtl } from "./transcript.mts";

/**
 * What one token written to the cache costs against one fresh input token, per
 * lifetime. Both are the same on every tier, which is why they are a constant
 * here while the read rate is a table: only the read has a per-model
 * exception. A rewind writes everything it keeps back to the cache at this
 * price, once, before any of the saving starts.
 */
const WRITE_MULTIPLIER: Readonly<Record<CacheTtl, number>> = {
	"5m": 1.25,
	"1h": 2,
};

/**
 * What the summary a rewind writes costs, in tokens of fresh input: about 4K
 * output tokens, at roughly five times the input price. One constant and not a
 * per-model figure, because it is the smallest of the three terms in a cut's
 * price and the write beside it swamps the difference.
 */
const SUMMARY_TOKENS = 20_000;

/** What a cut moves: what it summarizes away, and what it keeps. */
export interface Cut {
	/** Everything above the line, which every request re-reads if it is kept. */
	readonly prefixTokens: number;
	/** Everything from the line down, written back to the cache in one piece. */
	readonly keptTokens: number;
}

/**
 * What a cut leaves behind however deep it cuts: the summary it writes, and
 * whatever the session carries above the conversation itself, its project
 * instructions and skill listings included. A rewind pays it as surely as
 * `/compact` does, since both write a summary and both sit under the same
 * preamble.
 *
 * It does not scale with what was summarized. The size of a conversation
 * before a compaction and the size it leaves behind are uncorrelated; what the
 * floor tracks is the project, from around 12K where the preamble is light to
 * around 34K where it is heavy. So a session's own last compaction is what
 * predicts its next one, and this constant is for a session that has none.
 */
export const TYPICAL_CUT_FLOOR = 15_000;

/**
 * The cut that keeps `verbatimTokens` of the conversation: everything above
 * that stretch summarized away, the stretch and the floor written back in one
 * piece. `/compact` is the same cut with no stretch of its own, since the tail
 * it keeps is inside the floor measured from it.
 *
 * A cut deep enough to leave more than the context already holds summarizes
 * nothing away, so there is no saving in it and `paybackRequests` returns
 * null. Its `keptTokens` still says what it would leave, which is what tells
 * the reading it is a cut not worth offering.
 */
export function cutKeeping(
	contextTokens: number,
	floorTokens: number,
	verbatimTokens: number,
): Cut {
	const keptTokens = floorTokens + verbatimTokens;

	return {
		prefixTokens: Math.max(0, contextTokens - keptTokens),
		keptTokens,
	};
}

/**
 * How many requests after a cut it takes to earn back what the cut cost, on
 * the lifetime in force and at the rate its model reads cached tokens at. A
 * request is one call to the model, and every tool call ends one and starts
 * the next, so a turn on a single prompt is as many requests as its reply made
 * tool calls, plus one; a subagent runs on a context of its own and adds none.
 *
 * Every term is what the cut costs *over carrying on*. The stretch it keeps is
 * written at the write price where carrying on would have read it, so the
 * write costs only the difference; what it summarizes away is read once on the
 * way past, and the summary is written on top. Against that, every request
 * after the cut saves what the prefix cost to read. That saving does not
 * change with time, since the context regrows cut or not, so the two divide.
 *
 * Null where there is nothing above the prompt to stop re-reading: no saving
 * to divide by.
 */
export function paybackRequests(
	cut: Cut,
	ttl: CacheTtl,
	readRate: number,
): number | null {
	const saving = readRate * cut.prefixTokens;

	if (saving <= 0) {
		return null;
	}

	const cost =
		(WRITE_MULTIPLIER[ttl] - readRate) * cut.keptTokens +
		saving +
		SUMMARY_TOKENS;

	return Math.ceil(cost / saving);
}
