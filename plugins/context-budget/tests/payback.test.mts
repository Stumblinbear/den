// What a cut costs and when it has paid for itself, in numbers alone.
//
// A cut is a rewind at a prompt or a `/compact`, and this arithmetic cannot
// tell them apart: both summarize a prefix away, both write a summary, and
// both carry that summary afterwards. What separates them is the stretch each
// keeps verbatim over the floor, which is the term these cases vary.
//
// The floor is why a rewind is never free. Counting it at nothing prices a
// rewind as cheaper than the `/compact` it is a deeper version of, which is
// backwards: a rewind costs more and what it buys is the context it keeps.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	cutKeeping,
	paybackRequests,
	TYPICAL_CUT_FLOOR,
} from "../lib/payback.mts";

/** The rate every tier but Fable reads a cached token back at. */
const USUAL = 0.1;

/** Fable's, which is a quarter of it. */
const FABLE = 0.025;

test("a cut keeps the floor plus whatever it keeps verbatim", () => {
	assert.deepEqual(cutKeeping(200_000, 15_000, 50_000), {
		keptTokens: 65_000,
		prefixTokens: 135_000,
	});
});

test("`/compact` is the cut that keeps the floor and nothing over it", () => {
	assert.deepEqual(cutKeeping(200_000, 15_000, 0), {
		keptTokens: 15_000,
		prefixTokens: 185_000,
	});
});

test("a cut that would leave more than the context holds summarizes nothing", () => {
	// 25K of floor under 40K kept verbatim is 65K, against a context of 60K:
	// the rewind leaves more than carrying on re-reads, so there is nothing
	// above the line to stop reading.
	const cut = cutKeeping(60_000, 25_000, 40_000);

	assert.equal(cut.keptTokens, 65_000, "what it would leave is still said");
	assert.equal(cut.prefixTokens, 0);
	assert.equal(
		paybackRequests(cut, "1h", USUAL),
		null,
		"and no payback, because it saves nothing per request",
	);
});

test("a deeper cut pays back sooner, and keeps less", () => {
	const shallow = cutKeeping(200_000, TYPICAL_CUT_FLOOR, 100_000);
	const deep = cutKeeping(200_000, TYPICAL_CUT_FLOOR, 0);

	assert.equal(paybackRequests(shallow, "1h", USUAL), 30);
	assert.equal(paybackRequests(deep, "1h", USUAL), 4);
	assert.ok(
		shallow.keptTokens > deep.keptTokens,
		"which is the trade: the dearer cut is the one that keeps more",
	);
});

test("the floor alone separates `/compact` from a rewind at the newest prompt", () => {
	// A rewind at a prompt a turn has barely started keeps almost nothing
	// verbatim, so it is `/compact` with that turn stapled on. Counting the
	// floor is what keeps the two figures beside each other; without it the
	// rewind prices at a fraction of the `/compact` it very nearly is.
	const compact = cutKeeping(200_000, 15_000, 0);
	const newest = cutKeeping(200_000, 15_000, 5_800);

	const apart =
		(paybackRequests(newest, "1h", USUAL) ?? 0) -
		(paybackRequests(compact, "1h", USUAL) ?? 0);

	assert.ok(
		apart >= 0 && apart <= 1,
		"the rewind pays back " + apart + " requests after /compact",
	);
});

test("a bigger floor takes longer to earn back", () => {
	assert.equal(paybackRequests(cutKeeping(200_000, 15_000, 0), "1h", USUAL), 4);
	assert.equal(paybackRequests(cutKeeping(200_000, 30_000, 0), "1h", USUAL), 6);
});

test("the five-minute lifetime writes back at the cheaper rate", () => {
	// The write is 1.25x a fresh token against the hour's 2x, so the same cut
	// comes good sooner. Only the stretch it keeps is written, so the gap
	// widens with what the cut keeps and closes to nothing at `/compact`.
	const kept = cutKeeping(200_000, 15_000, 100_000);

	assert.equal(paybackRequests(kept, "1h", USUAL), 30);
	assert.equal(paybackRequests(kept, "5m", USUAL), 19);
});

test("the tier that reads at a quarter of the price takes about four times as long", () => {
	// The saving a cut buys is a read it no longer makes, so a cheaper read is
	// a smaller saving and the same cut takes longer to cover its write.
	assert.equal(paybackRequests(cutKeeping(200_000, 15_000, 0), "1h", USUAL), 4);
	assert.equal(
		paybackRequests(cutKeeping(200_000, 15_000, 0), "1h", FABLE),
		12,
	);
});
