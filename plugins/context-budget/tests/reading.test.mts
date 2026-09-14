// What a scan comes to before any of it is words: which options a reading
// offers, in what order, and what each one costs.
//
// Everything here calls `readingOf` in process, because what these cases are
// about is the reading's result and not what a run of anything prints. The
// words themselves are `cache-reading.mts`, and nothing asserts on them: a
// reading that offers the right rows carrying the right figures is a reading
// that reads correctly, and pinning the prose beside that only makes a rename
// break every case that was never about wording.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fixtureDir } from "../../../tests/harness.mts";
import { loadPricing } from "../lib/pricing.mts";
import { scanCacheWindow } from "../lib/prompt-cache.mts";
import { type Reading, type Row, readingOf } from "../lib/reading.mts";
import {
	assistant,
	at,
	CACHED_SESSION,
	COMPACT_SUMMARY,
	compactBoundary,
	prompt,
	toolResult,
} from "./fixtures.mts";
import { PLUGIN } from "./harness.mts";

let seq = 0;

const transcript = (...lines: readonly string[]): string => {
	seq += 1;

	const path = join(fixtureDir("reading"), `transcript-${seq}.jsonl`);

	writeFileSync(path, `${lines.join("\n")}\n`);

	return path;
};

/** The reading of one transcript, priced at the default rate. */
const read = (...lines: readonly string[]): Reading =>
	readingOf(scanCacheWindow(transcript(...lines)));

/** What each row is, in the order the reading offers them. */
const kinds = (reading: Reading): readonly string[] =>
	reading.rows.map((row) => row.kind);

/** The rows that price a cut, which is every row but carrying on. */
const cuts = (reading: Reading): readonly Extract<Row, { cut: unknown }>[] =>
	reading.rows.filter(
		(row): row is Extract<Row, { cut: unknown }> => row.kind !== "carry",
	);

test("the options are `/compact`, the cut points oldest first, then carrying on", () => {
	const reading = read(...CACHED_SESSION);

	assert.equal(reading.kind, "cut-points");
	assert.deepEqual(kinds(reading), ["compact", "cut", "cut", "carry"]);
	assert.deepEqual(
		reading.rows.flatMap((row) =>
			row.kind === "cut" ? [row.prompt.text] : [],
		),
		[
			"Read the brief and start on the scanner",
			"Now add the skill that takes a fresh reading",
		],
	);
});

test("the prompt above the cached ones is no option", () => {
	const reading = read(...CACHED_SESSION);

	assert.ok(
		!reading.rows.some(
			(row) => row.kind === "cut" && row.prompt.text.includes("before lunch"),
		),
		"it has gone cold, so a rewind there re-reads its whole prefix",
	);
	assert.equal(reading.everyPromptCached, false);
});

test("every option is priced against one floor", () => {
	// The floor is what a cut leaves behind however deep it cuts, so it is the
	// same term in every row and the only thing separating them is the stretch
	// each keeps over it. `/compact` keeps the floor and nothing more, which is
	// what makes it the cheapest cut on offer and the one preserving least.
	const reading = read(...CACHED_SESSION);
	const [compact, older, newer] = cuts(reading);

	assert.equal(reading.floor.tokens, 15_000);
	assert.equal(compact?.cut.keptTokens, 15_000);
	assert.equal(older?.cut.keptTokens, 115_000, "15K of floor under 100K kept");
	assert.equal(newer?.cut.keptTokens, 65_000, "and under 50K kept");
});

test("a cut costs more the more it keeps, and `/compact` keeps least", () => {
	const [compact, older, newer] = cuts(read(...CACHED_SESSION));

	assert.deepEqual(
		[compact?.requests, newer?.requests, older?.requests],
		[4, 12, 30],
	);
});

test("carrying on is what every payback is measured against", () => {
	const reading = read(...CACHED_SESSION);
	const carry = reading.rows.at(-1);

	assert.equal(carry?.kind, "carry");
	assert.deepEqual(
		carry?.kind === "carry"
			? [carry.contextTokens, carry.perRequestTokens]
			: null,
		[200_000, 20_000],
	);
});

test("the floor is measured from the session's own compaction", () => {
	// What the next `/compact` leaves is never known before it runs, and it
	// does not scale with what it summarizes: what predicts it is the session
	// itself. A compaction this session has already made is that measurement,
	// and what it left behind is what the request after it wrote back in one
	// piece, which is exactly the term every row prices.
	const reading = read(
		assistant(100_000, { minutesAgo: 50 }),
		prompt("A prompt the compaction kept verbatim", at(45), { uuid: "kept-1" }),
		compactBoundary({ minutesAgo: 32, postTokens: 30_000, kept: ["kept-1"] }),
		COMPACT_SUMMARY,
		assistant(120_000, { minutesAgo: 30 }),
		prompt("The first prompt after the compaction", at(25)),
		assistant(200_000, { minutesAgo: 24 }),
	);

	assert.equal(reading.floor.tokens, 30_000);
	assert.notEqual(reading.floor.at, null, "and says which compaction it read");
	assert.equal(cuts(reading)[0]?.requests, 6);
});

test("a rewind summarize measures no floor", () => {
	// A rewind summarize writes the same boundary a compaction does, but what
	// it left behind is whatever stretch the user chose to keep: 120K here.
	// Reading that as the floor prices the rewind the user has already taken
	// and calls it `/compact`, which steers away from `/compact` in exactly the
	// sessions that have just used the picker.
	const reading = read(
		assistant(100_000, { minutesAgo: 50 }),
		prompt("A prompt the rewind kept verbatim", at(45), { uuid: "kept-1" }),
		compactBoundary({
			minutesAgo: 32,
			postTokens: 120_000,
			kept: ["kept-1"],
			splicedAbove: true,
		}),
		COMPACT_SUMMARY,
		assistant(140_000, { minutesAgo: 30 }),
		prompt("The first prompt after the rewind", at(25)),
		assistant(200_000, { minutesAgo: 24 }),
	);

	assert.equal(reading.floor.tokens, 15_000);
	assert.equal(reading.floor.at, null);
});

test("the other rewind direction measures no floor either", () => {
	// "Summarize from here" keeps everything before the prompt the user picked
	// and writes its summary after it, so its boundary carries on from the end
	// of what it kept, as a compaction's does. What separates them is the other
	// end: a compaction keeps a recent tail with conversation above it, and
	// this one kept the head, with nothing above.
	const reading = read(
		// Every real transcript opens with entries of this kind above its first
		// prompt, so a walk that stopped at the first of them would read this
		// boundary as a compaction.
		JSON.stringify({
			type: "queue-operation",
			operation: "enqueue",
			timestamp: at(61),
		}),
		prompt("The prompt the rewind summarized from", at(60), { uuid: "kept-1" }),
		compactBoundary({ minutesAgo: 40, postTokens: 120_000, kept: ["kept-1"] }),
		COMPACT_SUMMARY,
		assistant(140_000, { minutesAgo: 30 }),
		prompt("The first prompt after the rewind", at(25)),
		assistant(200_000, { minutesAgo: 24 }),
	);

	assert.equal(reading.floor.at, null);
	assert.equal(reading.floor.tokens, 15_000);
});

test("a compaction that kept prompts is the whole of the choice", () => {
	// The prompts a compaction kept verbatim cost the same as one another to
	// rewind to, so the boundary prices them and nothing else does. Pricing
	// `/compact` beside them would put a figure on the dearer of the two ways
	// on and none on the cheaper.
	const reading = read(
		assistant(100_000, { minutesAgo: 50 }),
		prompt("The first prompt the compaction kept", at(45), { uuid: "kept-1" }),
		prompt("The second prompt it kept", at(44), { uuid: "kept-2" }),
		compactBoundary({ minutesAgo: 20, kept: ["kept-1", "kept-2"] }),
		COMPACT_SUMMARY,
		assistant(120_000, { minutesAgo: 19 }),
	);

	assert.equal(reading.kind, "compacted-to-boundary");
	assert.deepEqual(reading.rows, [], "no row is priced beside the boundary");
	assert.equal(reading.compaction?.kept.length, 2);
});

test("a compaction that kept nothing still prices the two ways on", () => {
	// No prompt was kept verbatim, so there is no rewind on offer at any price,
	// and the prompt sent since has gone cold. That leaves the same two options
	// a session with no compaction has, and a reading that said only what the
	// compaction cost would leave the agent a sentence about the past and no
	// figure to act on.
	const reading = read(
		assistant(80_000, { minutesAgo: 60 }),
		prompt("A prompt the compaction summarized away", at(55)),
		assistant(100_000, { minutesAgo: 50 }),
		toolResult("The result the compaction kept verbatim", at(45), {
			uuid: "kept-1",
		}),
		compactBoundary({ minutesAgo: 40, kept: ["kept-1"] }),
		COMPACT_SUMMARY,
		assistant(60_000, { minutesAgo: 39, ttl: "5m" }),
		prompt("The only prompt in the new context", at(35)),
		assistant(200_000, { minutesAgo: 34, ttl: "5m" }),
	);

	assert.equal(reading.kind, "no-cut-points");
	assert.deepEqual(kinds(reading), ["compact", "carry"]);
	assert.notEqual(reading.floor.at, null, "the boundary is a compaction's");
});

test("a session with nothing cached left is down to the two whole-context rows", () => {
	const reading = read(
		assistant(100_000, { minutesAgo: 55, ttl: "5m" }),
		prompt("Read the brief and start on the scanner", at(50)),
		assistant(200_000, { minutesAgo: 30, ttl: "5m" }),
	);

	assert.equal(reading.kind, "no-cut-points");
	assert.equal(reading.ttl, "5m");
	assert.deepEqual(kinds(reading), ["compact", "carry"]);
	assert.equal(cuts(reading)[0]?.requests, 4);
});

test("a context whose only prompt opens it has nothing to cut at yet", () => {
	// A cut at the first prompt of a context summarizes nothing away, so it is
	// no cut point. An empty list for that reason is a different fact from an
	// empty list because the cache has expired, and only the second costs the
	// user a full-price read wherever they land.
	const reading = read(
		prompt("The prompt this context opens with", at(30)),
		assistant(200_000, { minutesAgo: 25 }),
	);

	assert.equal(reading.kind, "nothing-to-cut");
	assert.equal(reading.everyPromptCached, true);
	assert.deepEqual(kinds(reading), ["compact", "carry"]);
});

test("a context whose only prompt is still being answered has nothing to cut at yet", () => {
	// A session's first reply, read from inside it. The scan leaves out the
	// prompt a running reply answers, so nothing is listed, and that is a
	// context too young to cut in rather than one whose prompts went cold.
	const reading = read(
		prompt("The prompt this context opens with", at(2)),
		assistant(200_000, { minutesAgo: 1, running: true }),
	);

	assert.equal(reading.kind, "nothing-to-cut");
	assert.deepEqual(kinds(reading), ["compact", "carry"]);
});

test("a reading that quotes no payback discloses no rate", () => {
	// Compacted, with nothing sent since: the walk meets no assistant turn, so
	// the transcript names no model and the reading falls back to the default
	// rate. Nothing is priced at that rate, because no row carries a figure, and
	// a rate disclosed over a passage quoting no number reads as a fact about
	// the compaction beside it.
	const reading = read(
		assistant(100_000, { minutesAgo: 50 }),
		prompt("The prompt the compaction kept", at(45), { uuid: "kept-1" }),
		compactBoundary({ minutesAgo: 20, kept: ["kept-1"] }),
		COMPACT_SUMMARY,
	);

	assert.equal(reading.assumedRate, null);
	assert.deepEqual(reading.rows, []);
});

test("a transcript naming no model is priced at the default, and discloses it", () => {
	const reading = read(
		assistant(100_000, { minutesAgo: 55, model: "" }),
		prompt("Read the brief and start on the scanner", at(50)),
		assistant(150_000, { minutesAgo: 40, model: "" }),
		prompt("Now add the skill that takes a fresh reading", at(35)),
		assistant(200_000, { minutesAgo: 30, model: "" }),
	);

	assert.equal(
		reading.assumedRate,
		0.1,
		"a figure four times out is worth flagging",
	);
	assert.ok(cuts(reading).every((row) => row.requests !== null));
});

test("the transcript's own model is what its rows are priced at", async () => {
	// Fable reads a cached token back at a quarter of the usual rate, so the
	// saving a cut buys is a quarter the size and the same cut takes about four
	// times as many requests to cover its write.
	const pricing = await loadPricing({
		shipped: join(PLUGIN, "lib", "pricing.toml"),
		overrides: null,
	});

	const scan = scanCacheWindow(transcript(...CACHED_SESSION));
	const fable = scanCacheWindow(
		transcript(
			assistant(100_000, { minutesAgo: 55, model: "claude-fable-5-1" }),
			prompt("Read the brief and start on the scanner", at(50)),
			assistant(150_000, { minutesAgo: 40, model: "claude-fable-5-1" }),
			prompt("Now add the skill that takes a fresh reading", at(35)),
			assistant(200_000, { minutesAgo: 30, model: "claude-fable-5-1" }),
		),
	);

	assert.equal(cuts(readingOf(scan, pricing))[0]?.requests, 4);
	assert.equal(cuts(readingOf(fable, pricing))[0]?.requests, 12);
	assert.equal(
		readingOf(fable, pricing).assumedRate,
		null,
		"the table knows the tier, so nothing was assumed",
	);
});

test("the list is three prompts spread across the context, not the clock", () => {
	// A busy stretch: five prompts, all cached. Listing every one is a page of
	// rows that say the same thing, and the three worth choosing between are
	// the ones cutting the context in different places rather than at different
	// times. Prompt 3 is the middle by size and prompt 2 the middle by clock.
	const reading = read(
		assistant(50_000, { minutesAgo: 200 }),
		prompt("The stale prompt from before lunch", at(190)),
		assistant(100_000, { minutesAgo: 50 }),
		...[
			[45, 101_000],
			[41, 102_000],
			[37, 140_000],
			[33, 180_000],
		].flatMap(([minutesAgo, tokens], i) => [
			prompt(`Prompt number ${i}`, at(Number(minutesAgo))),
			assistant(Number(tokens), { minutesAgo: Number(minutesAgo) - 1 }),
		]),
		prompt("Prompt number 4", at(29)),
		assistant(200_000, { minutesAgo: 28 }),
	);

	assert.deepEqual(
		reading.rows.flatMap((row) =>
			row.kind === "cut" ? [row.prompt.text] : [],
		),
		["Prompt number 0", "Prompt number 3", "Prompt number 4"],
		"the oldest, the one closest to halfway between their prefixes, and the newest",
	);
	assert.equal(cuts(reading)[2]?.cut.keptTokens, 75_000, "15K under prompt 3");
	assert.equal(cuts(reading)[2]?.requests, 14);
});

test("the lifetime in force is what a cut writes back at", () => {
	// The rewind's own write happens now, whatever the prefix it re-reads was
	// written under, and the five-minute lifetime writes at 1.25 fresh tokens
	// against the hour's 2. Only the stretch a cut keeps is written, so the two
	// lifetimes differ most on the cut points that preserve most.
	const reading = read(
		assistant(100_000, { minutesAgo: 20, ttl: "5m" }),
		prompt("A prompt from a while ago", at(19)),
		assistant(150_000, { minutesAgo: 4, ttl: "5m" }),
		prompt("The prompt still inside the five minutes", at(3)),
		assistant(200_000, { minutesAgo: 2, ttl: "5m" }),
	);

	assert.equal(reading.ttl, "5m");
	assert.equal(cuts(reading).at(-1)?.cut.keptTokens, 65_000);
	assert.equal(cuts(reading).at(-1)?.requests, 9, "and 12 on the hour");
});
