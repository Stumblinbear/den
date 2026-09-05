// The parts of the cache scan that a reading printed by the cut-point script
// does not show.
//
// The first is a session whose cache lifetime changed part way through. Which
// lifetime a prompt expires on is the one its own preceding turn was billed
// under, not the session's current one, and the difference only shows in the
// expiry arithmetic.
//
// The second is what the walk found above the cached prompts, which the
// reading turns into one clause and never quotes: the prompt a session opened
// with is a selectable cut point above them without being one of them, a
// compaction the walk could not price is not one at all, and a prompt
// straddling the seam of the backward read is neither lost nor mangled.
//
// These call the scan in process, since what they are about is its result and
// not what a run of anything prints.
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fixtureDir } from "../../../tests/harness.mts";
import { CHUNK_BYTES } from "../lib/lines-backward.mts";
import { scanCacheWindow } from "../lib/prompt-cache.mts";
import { assistant, at, COMPACT_SUMMARY, HOUR, prompt } from "./fixtures.mts";

let seq = 0;

function transcript(...lines: readonly string[]): string {
	seq += 1;

	const path = join(fixtureDir("prompt-cache"), `transcript-${seq}.jsonl`);

	writeFileSync(path, `${lines.join("\n")}\n`);

	return path;
}

test("a prompt expires on the lifetime its own preceding turn was billed under", () => {
	const sent = at(20);
	const path = transcript(
		assistant(100_000, { minutesAgo: 45, ttl: "5m" }),
		prompt("The prompt behind the switch to a 1h cache", at(40)),
		assistant(150_000, { minutesAgo: 39, ttl: "1h" }),
		prompt("The prompt whose prefix the 1h turn wrote", sent),
		assistant(200_000, { minutesAgo: 19, ttl: "5m" }),
	);

	const scan = scanCacheWindow(path);

	assert.equal(
		scan.ttl,
		"5m",
		"the session is on 5m: that is its newest split",
	);
	assert.deepEqual(
		scan.prompts.map((one) => one.text),
		["The prompt whose prefix the 1h turn wrote"],
		"the 5m turn above the older prompt left it cold 35 minutes ago",
	);
	assert.equal(
		scan.prompts[0]?.expiresAt.getTime(),
		Date.parse(sent) + HOUR,
		"its prefix was written by the 1h turn, so it lives an hour",
	);
	assert.equal(scan.prompts[0]?.prefixTokens, 150_000);
	assert.deepEqual(scan.above, { kind: "colder" });
});

test("a prompt is cached above a cold one where its own turn wrote a longer lifetime", () => {
	// Older is not colder once the lifetime has switched. The 5m turn leaves the
	// prompt just above it cold after five minutes, but the prompt above that
	// one was written by a 1h turn and is still cached an hour on. A walk that
	// stops at the first cold prompt reports no cut point at all where a cheap
	// one is sitting two entries further back.
	const sent = at(55);
	const path = transcript(
		assistant(50_000, { minutesAgo: 100, ttl: "1h" }),
		prompt("The prompt the 1h turn kept cached", sent),
		assistant(100_000, { minutesAgo: 45, ttl: "5m" }),
		prompt("The prompt the 5m turn left cold", at(40)),
		assistant(200_000, { minutesAgo: 39, ttl: "1h" }),
	);

	const scan = scanCacheWindow(path);

	assert.deepEqual(
		scan.prompts.map((one) => one.text),
		["The prompt the 1h turn kept cached"],
		"the cold prompt is dropped and the walk goes on past it",
	);
	assert.equal(scan.prompts[0]?.prefixTokens, 50_000);
	assert.equal(
		scan.prompts[0]?.expiresAt.getTime(),
		Date.parse(sent) + HOUR,
		"the 1h turn wrote its prefix, so it lives an hour from when it was sent",
	);
	assert.deepEqual(
		scan.above,
		{ kind: "colder" },
		"the dropped prompt is a cut point above it, and it costs",
	);
});

test("the prompt a session opened with counts as a cut point above the cached ones", () => {
	// It is the one prompt with no assistant turn before it, so the walk never
	// settles it and reaches the start of the file still holding it. Cold, it is
	// still a selectable prompt above the cached ones, which is the difference
	// between "there are older cut points and they all cost" and "this is as far
	// back as the session goes". Every real session over an hour old is this
	// case.
	const scan = scanCacheWindow(
		transcript(
			prompt("The prompt this session opened with", at(90)),
			assistant(60_000, { minutesAgo: 89 }),
			prompt("The prompt that is still warm", at(30)),
			assistant(200_000, { minutesAgo: 29 }),
		),
	);

	assert.deepEqual(
		scan.prompts.map((one) => one.text),
		["The prompt that is still warm"],
	);
	assert.deepEqual(scan.above, { kind: "colder" });
});

test("a compaction the walk cannot price is nothing above the cached ones", () => {
	// A session resumed into a transcript of its own: the summary of the
	// compaction is the first entry, and the boundary it belongs to is in the
	// file the session was resumed from. There is a compaction above the cached
	// prompts with nothing to price it by, and nothing it kept to cut at. That
	// is what reaching the start of the file looks like, and it is reported as
	// that.
	const scan = scanCacheWindow(
		transcript(
			COMPACT_SUMMARY,
			assistant(40_000, { minutesAgo: 50 }),
			prompt("The first prompt of the resumed context", at(45)),
			assistant(200_000, { minutesAgo: 44 }),
		),
	);

	assert.deepEqual(
		scan.prompts.map((one) => one.text),
		["The first prompt of the resumed context"],
	);
	assert.deepEqual(scan.above, { kind: "nothing" });
});

/** The three-byte character the seam is made to fall inside. */
const MARK = "—";

const STRADDLED = `The prompt the seam runs ${MARK} through`;

const SEAMED = ["The prompt above the seam", STRADDLED, "The prompt below it"];

/**
 * A transcript whose first seam falls inside `MARK`. The scan reads the file
 * end-first in fixed-size byte chunks, and that seam falls at
 * `size - CHUNK_BYTES`. A reader that treats each chunk on its own drops the
 * entry that straddles it, and one that decodes each chunk before joining them
 * mangles the character the seam runs through. Neither shows up in a
 * transcript that happens to seam somewhere harmless, so the file is padded
 * until the seam lands inside a known character, and both failures are on
 * every run rather than on the runs that get unlucky.
 */
function seamed(): string {
	const body = Buffer.from(
		`${[
			assistant(100_000, { minutesAgo: 50 }),
			...SEAMED.map((text, i) => prompt(text, at(45 - i))),
			assistant(200_000, { minutesAgo: 10 }),
		].join("\n")}\n`,
	);

	// An entry the scan reads and ignores, sized so that the file ends exactly
	// CHUNK_BYTES past the middle byte of the mark.
	const mark = body.indexOf(Buffer.from(MARK));
	const filler = '{"type":"system","subtype":"filler","content":"';
	const padding = mark + 1 + CHUNK_BYTES - body.length - filler.length - 3;

	assert.ok(
		padding > 0,
		`the fixture is too long to seam by ${-padding} bytes`,
	);

	const path = join(fixtureDir("seam"), "seam.jsonl");

	writeFileSync(
		path,
		Buffer.concat([body, Buffer.from(`${filler}${"x".repeat(padding)}"}\n`)]),
	);

	const seam = statSync(path).size - CHUNK_BYTES;

	assert.ok(
		mark < seam && seam < mark + Buffer.byteLength(MARK),
		`the seam is meant to fall inside the mark at ${mark}, and falls at ${seam}`,
	);

	return path;
}

test("no prompt is lost or mangled where the backward read changes chunk", () => {
	const scan = scanCacheWindow(seamed());

	assert.deepEqual(
		scan.prompts.map((one) => one.text),
		SEAMED,
		"every prompt, oldest first, with its text intact",
	);
	assert.deepEqual(scan.above, { kind: "nothing" });
});
