// What a rewind cut point costs and what it pays back: the write a cut pays
// now, the summary it writes, and the per-turn read they buy back. The rate
// those reads are priced at is the one term of the three that varies by model,
// so it comes in from the price table rather than living here.
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

/** What a cut at one prompt moves: what it summarizes, and what it keeps. */
export interface Cut {
	/** Everything before the prompt, which every turn re-reads if it is kept. */
	readonly prefixTokens: number;
	/** Everything from the prompt down, written back to the cache in one piece. */
	readonly keptTokens: number;
}

/**
 * How many turns after a cut it takes to earn back what the cut cost, on the
 * lifetime in force and at the rate its model reads cached tokens at.
 *
 * Every term is what the cut costs *over carrying on*. The stretch it keeps is
 * written at the write price where carrying on would have read it, so the
 * write costs only the difference; what it summarizes away is read once on the
 * way past, and the summary is written on top. Against that, every turn after
 * the cut saves what the prefix cost to read -- a saving that does not change
 * with time, since the context regrows cut or not, so the two divide.
 *
 * Null where there is nothing above the prompt to stop re-reading: no saving
 * to divide by.
 */
export function paybackTurns(
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
