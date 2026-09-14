// The backward read every hook takes of a transcript, at the one place it can
// go wrong unseen: the seam between two chunks. Read through `recentTurns`,
// which is what the watcher hands its judge, so what is asserted is the
// prompts a hook gets back.
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fixtureDir } from "../../../tests/harness.mts";
import { CHUNK_BYTES } from "../lib/lines-backward.mts";
import { recentTurns } from "../lib/recent-turns.mts";
import { assistant, at, prompt } from "./fixtures.mts";

/** The three-byte character the seam is made to fall inside. */
const MARK = "€";

const SEAMED = [
	"The prompt above the seam",
	`The prompt the seam runs ${MARK} through`,
	"The prompt below it",
];

/**
 * A transcript whose first seam falls inside `MARK`. The file is read end-first
 * in `CHUNK_BYTES` chunks, so that seam sits at `size - CHUNK_BYTES`, and the
 * file is padded to put it there. A reader that treats each chunk on its own
 * drops the entry across the seam, and one that decodes each chunk before
 * joining them mangles the character in it; a seam that lands somewhere
 * harmless shows neither, so this one is placed on every run.
 */
function seamed(): string {
	const body = Buffer.from(
		`${[
			assistant(100_000, { minutesAgo: 50 }),
			...SEAMED.map((text, i) => prompt(text, at(45 - i))),
			assistant(200_000, { minutesAgo: 10 }),
		].join("\n")}\n`,
	);

	// An entry every reader skips, sized so that the file ends exactly
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
	assert.deepEqual(
		recentTurns(seamed(), 16).map((turn) => turn.asked),
		SEAMED,
		"every prompt, oldest first, with its text intact",
	);
});
