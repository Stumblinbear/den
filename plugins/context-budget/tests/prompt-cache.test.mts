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
import {
	apiError,
	assistant,
	at,
	COMPACT_SUMMARY,
	compactBoundary,
	crossSessionMessage,
	HOUR,
	prompt,
	toolResult,
} from "./fixtures.mts";

let seq = 0;

function transcript(...lines: readonly string[]): string {
	seq += 1;

	const path = join(fixtureDir("prompt-cache"), `transcript-${seq}.jsonl`);

	writeFileSync(path, `${lines.join("\n")}\n`);

	return path;
}

test("a message relayed from another session is not a cut point", () => {
	// The fixture carries both of the marks `eligible` refuses, `isMeta` and a
	// peer origin, so the scan lists the prompts either side of it and leaves
	// the message between them out.
	const path = transcript(
		assistant(100_000, { minutesAgo: 45 }),
		prompt("The prompt the user typed", at(40)),
		assistant(150_000, { minutesAgo: 39 }),
		crossSessionMessage(
			"Cache wake 1 of 2: background work still running",
			at(30),
		),
		assistant(150_500, { minutesAgo: 29 }),
		prompt("The next prompt the user typed", at(20)),
		assistant(200_000, { minutesAgo: 19 }),
	);

	const scan = scanCacheWindow(path);

	assert.deepEqual(
		scan.prompts.map((one) => one.text),
		["The prompt the user typed", "The next prompt the user typed"],
	);
});

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

test("the prompt a running reply is answering is not a cut point", () => {
	// How the cut-point script always meets the transcript: it runs from a
	// skill preamble inside the reply to the newest prompt, so that prompt is
	// in the context, has turns pricing it, and is still no cut point. A rewind
	// there throws away the reply that recommended it and keeps whatever that
	// reply has spent so far, which is `/compact` with the turn stapled on.
	const running = transcript(
		assistant(100_000, { minutesAgo: 45 }),
		prompt("The prompt before the one in flight", at(40)),
		assistant(150_000, { minutesAgo: 39 }),
		prompt("The prompt being answered right now", at(5)),
		assistant(200_000, { minutesAgo: 1, running: true }),
	);

	const scan = scanCacheWindow(running);

	assert.deepEqual(
		scan.prompts.map((one) => one.text),
		["The prompt before the one in flight"],
	);
	assert.equal(scan.answering, true);
});

test("the newest prompt of a finished reply is a cut point like any other", () => {
	// The same transcript read once the reply has ended, which is what a hand
	// run against another session sees. Nothing is in flight there, so nothing
	// is dropped: the turn that says so is the newest one in the file.
	const ended = transcript(
		assistant(100_000, { minutesAgo: 45 }),
		prompt("The prompt before the one in flight", at(40)),
		assistant(150_000, { minutesAgo: 39 }),
		prompt("The prompt being answered right now", at(5)),
		assistant(200_000, { minutesAgo: 1 }),
	);

	assert.deepEqual(
		scanCacheWindow(ended).prompts.map((one) => one.text),
		[
			"The prompt before the one in flight",
			"The prompt being answered right now",
		],
	);
});

test("user entries the rewind picker would not list are never cut points", () => {
	// A prompt the picker will not offer is no use as a recommendation however
	// cheap a cut there would be, so the scan has to refuse exactly what the
	// picker refuses: tool results, the harness's own records, a report relayed
	// from a subagent, and the markers written in the user's place.
	const path = transcript(
		// Cold, and above everything else: it keeps the one prompt below from
		// being the first of the context, which would take it off the list on
		// grounds that have nothing to do with the picker.
		assistant(60_000, { minutesAgo: 200 }),
		prompt("The stale prompt from hours ago", at(190)),
		assistant(100_000, { minutesAgo: 50 }),
		toolResult("Reading the file the picker never offers", at(45)),
		prompt("A meta entry the harness wrote", at(44), { isMeta: true }),
		prompt(
			"<task-notification><task-id>abc</task-id></task-notification>",
			at(43),
		),
		prompt("A relayed subagent report", at(42), {
			origin: { kind: "task-notification" },
		}),
		prompt("An entry shown in the transcript only", at(41), {
			isVisibleInTranscriptOnly: true,
		}),
		prompt("[Request interrupted by user]", at(40), {
			message: {
				role: "user",
				content: [{ type: "text", text: "[Request interrupted by user]" }],
			},
			interruptedMessageId: "msg_01",
		}),
		prompt("The one prompt the user actually typed", at(30)),
		assistant(200_000, { minutesAgo: 29 }),
	);

	assert.deepEqual(
		scanCacheWindow(path).prompts.map((one) => one.text),
		["The one prompt the user actually typed"],
	);
});

test("the scan crosses a boundary only for the prompts it kept", () => {
	// Everything a compaction summarized away is gone from the context and from
	// the picker with it, so the walk may read the prompts above a boundary
	// only through the list that boundary kept.
	const scan = scanCacheWindow(
		transcript(
			assistant(80_000, { minutesAgo: 60 }),
			prompt("A prompt the compaction summarized away", at(55)),
			assistant(100_000, { minutesAgo: 50 }),
			prompt("A prompt the compaction kept verbatim", at(45), {
				uuid: "kept-1",
			}),
			compactBoundary({ minutesAgo: 32, postTokens: 30_000, kept: ["kept-1"] }),
			COMPACT_SUMMARY,
			assistant(120_000, { minutesAgo: 30 }),
			prompt("The first prompt after the compaction", at(25)),
			assistant(200_000, { minutesAgo: 24 }),
		),
	);

	assert.deepEqual(
		scan.prompts.map((one) => one.text),
		["The first prompt after the compaction"],
	);
	assert.equal(scan.above.kind, "compaction");
	assert.deepEqual(
		scan.above.kind === "compaction" ? scan.above.compaction.kept : null,
		["A prompt the compaction kept verbatim"],
	);
});

test("the `/compact` command's own entry is never a cut point", () => {
	// The harness writes the `/compact` user entry after the boundary it caused
	// and stamps it from before it, so the scan reads it as the first prompt of
	// the new context. A rewind there lands on a context whose first message is
	// the compaction summary, which is what the session had just finished doing.
	const scan = scanCacheWindow(
		transcript(
			prompt("The prompt the compaction kept verbatim", at(120), {
				uuid: "kept-1",
			}),
			assistant(150_000, { minutesAgo: 119 }),
			compactBoundary({ minutesAgo: 40, postTokens: 31_212, kept: ["kept-1"] }),
			COMPACT_SUMMARY,
			prompt(
				"<command-name>/compact</command-name><command-message>compact</command-message><command-args></command-args>",
				at(41),
			),
			assistant(60_000, { minutesAgo: 39 }),
			prompt("Ordinary prompt one", at(35)),
			assistant(100_000, { minutesAgo: 34 }),
			prompt("Ordinary prompt two", at(30)),
			assistant(140_000, { minutesAgo: 29 }),
		),
	);

	assert.deepEqual(
		scan.prompts.map((one) => one.text),
		["Ordinary prompt one", "Ordinary prompt two"],
	);
});

test("a failed request is not the turn a prompt is priced against", () => {
	// A request that never reached the model is written as an assistant entry
	// all the same, with every usage field zero. It carried no context and wrote
	// no cache entry, so the prompt below it is priced against the turn above
	// it, the last one that really ran.
	const scan = scanCacheWindow(
		transcript(
			assistant(100_000, { minutesAgo: 45 }),
			prompt("Read the brief and start on the scanner", at(40)),
			apiError({ minutesAgo: 39 }),
			prompt("Now add the skill that takes a fresh reading", at(20)),
			assistant(200_000, { minutesAgo: 19 }),
		),
	);

	assert.equal(scan.contextTokens, 200_000);
	assert.deepEqual(
		scan.prompts.map((one) => [one.text, one.prefixTokens, one.keptTokens]),
		[
			["Read the brief and start on the scanner", 100_000, 100_000],
			["Now add the skill that takes a fresh reading", 100_000, 100_000],
		],
	);
});

test("a failed request is not the turn the model is read from", () => {
	// The synthetic id a failed entry carries ("<synthetic>") matches no row in
	// the price table, so a scan that took the model from the newest entry
	// rather than the newest turn would quietly price Fable at the default rate,
	// which is four times what it saves.
	const scan = scanCacheWindow(
		transcript(
			assistant(200_000, { minutesAgo: 45, model: "claude-fable-5-1" }),
			prompt("Read the brief and start on the scanner", at(40)),
			prompt("Now add the skill that takes a fresh reading", at(20)),
			assistant(500_000, { minutesAgo: 19, model: "claude-fable-5-1" }),
			apiError({ minutesAgo: 5 }),
		),
	);

	assert.equal(scan.model, "claude-fable-5-1");
});

test("a prefix behind a turn that wrote nothing lives as long as the write", () => {
	// A request served entirely from the cache writes nothing back to it: the
	// entry the prompt below it would be rewound to was written by an older
	// request, and a read refreshes an entry without changing how long it lives.
	// So the lifetime is that older request's, which is not the session's
	// current one if the setting changed since.
	const scan = scanCacheWindow(
		transcript(
			assistant(100_000, { minutesAgo: 45, ttl: "5m" }),
			prompt("Read the brief and start on the scanner", at(40)),
			assistant(150_000, { minutesAgo: 39, ttl: null }),
			prompt("Now add the skill that takes a fresh reading", at(20)),
			assistant(200_000, { minutesAgo: 19, ttl: "1h" }),
		),
	);

	assert.deepEqual(
		scan.prompts.map((one) => one.text),
		[],
		"its prefix was written under 5m, 39 minutes ago, so it is not cached",
	);
});
