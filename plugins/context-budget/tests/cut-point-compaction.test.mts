// What the cut-point reading says about a session that has been compacted.
// The prompts a compaction kept verbatim above its own boundary are all priced
// alike by what it left behind, so they are a choice the reading has to name
// even when nothing newer is cached -- and a boundary that kept nothing leaves
// a context with no cut point in it at all, which is not the same as a cache
// that has expired.
import assert from "node:assert/strict";
import { test } from "node:test";
import { runtimes } from "../../../tests/harness.mts";
import {
	assistant,
	at,
	COMPACT_SUMMARY,
	compactBoundary,
	hhmm,
	prompt,
} from "./fixtures.mts";
import { reading, scriptRunner, transcript } from "./harness.mts";

// A session compacted twenty minutes ago, keeping two prompts verbatim above
// its boundary, with one turn taken since. Nothing sent since that turn, so the
// cached list is empty and the compaction is all the reading has to price.
const compacted = at(20);
const COMPACTED_SESSION: readonly string[] = [
	prompt("Read the brief and start on the scanner", at(120), {
		uuid: "kept-1",
	}),
	assistant(150_000, { minutesAgo: 119 }),
	prompt("Now add the skill that takes a fresh reading", at(100), {
		uuid: "kept-2",
	}),
	assistant(160_000, { minutesAgo: 99 }),
	compactBoundary({
		minutesAgo: 20,
		postTokens: 48_631,
		kept: ["kept-1", "kept-2"],
	}),
	COMPACT_SUMMARY,
	assistant(200_000, { minutesAgo: 19 }),
];

// What that session's reading says either way: what the compaction cost, that
// there is nothing newer to choose instead, and the prompts it kept.
const COMPACTED_READING = new RegExp(
	`The session was compacted at ${hhmm(compacted)} down to 48\\.6K tokens, ` +
		`and there is nothing newer to cut at\\. ` +
		`The 2 prompts kept verbatim, from "Read the brief and start on the scanner" on, ` +
		`can be rewound to for at most that price\\.`,
);

for (const runtime of runtimes()) {
	const script = scriptRunner(runtime);
	const name = (what: string) => `${runtime}: ${what}`;
	const read = (...lines: readonly string[]) =>
		reading(script("", ["--transcript", transcript(...lines)]));

	test(
		name(
			"a compaction names the prompts it kept and what a rewind there costs",
		),
		() => {
			// No prompt has been sent since the compaction, so the cached list is
			// empty on a context the session has just finished compacting. What is
			// true in that state is not "nothing is cached, use `/compact`": the
			// compaction kept a stretch of prompts verbatim above its own
			// boundary, and a rewind at any of them costs at most what it left
			// behind.
			const out = read(...COMPACTED_SESSION);

			assert.doesNotMatch(out, /no cut point is still cached/);
			assert.match(out, COMPACTED_READING);
		},
	);

	test(
		name("a prompt in flight is not the session going quiet after one"),
		() => {
			// The same session with the newest prompt still in flight. It is no cut
			// point, so the cached list is empty here too -- but something was sent,
			// so the reading may not infer from an empty list that nothing has been.
			assert.match(
				read(
					...COMPACTED_SESSION,
					prompt("was there anything still pending?", at(1)),
				),
				COMPACTED_READING,
				"and what the agent is to recommend is what it was when the session was idle",
			);
		},
	);

	test(name("the scan crosses a boundary only for the prompts it kept"), () => {
		const out = read(
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
		);

		assert.match(
			out,
			/The one prompt kept verbatim since then, from "A prompt the compaction kept verbatim" on/,
		);
		assert.match(
			out,
			/1\. "The first prompt after the compaction"\s+sent \d\d:\d\d \| valid until \d\d:\d\d \| 120K tokens before it, keeps 80K, pays back after 16 turns/,
		);
		assert.doesNotMatch(
			out,
			/summarized away/,
			"a prompt the compaction did not keep is gone from the context and the picker",
		);
	});

	test(name("a compaction that kept nothing leaves nothing to cut at"), () => {
		// The boundary kept no prompt verbatim, so the only prompt in the context
		// is the first one sent after it -- and a cut there summarizes nothing
		// away. Saying what the compaction cost adds nothing to that choice,
		// because there is no choice; what the agent needs to hear is that there
		// is nothing to cut at yet, rather than a bare "every prompt in the
		// context is cached" that reads as an empty list.
		const out = read(
			assistant(80_000, { minutesAgo: 60 }),
			prompt("A prompt the compaction summarized away", at(55)),
			assistant(100_000, { minutesAgo: 50 }),
			compactBoundary({ minutesAgo: 40, postTokens: 31_212, kept: [] }),
			COMPACT_SUMMARY,
			assistant(60_000, { minutesAgo: 39 }),
			prompt("The only prompt in the new context", at(35)),
			assistant(200_000, { minutesAgo: 34 }),
		);

		assert.doesNotMatch(out, /The session was compacted/);
		assert.match(
			out,
			/Prompt cache, read at \d\d:\d\d \(1h lifetime\)\. Every prompt in the context is cached; the only one with a turn after it is its first, so there is nothing to cut at yet\./,
		);
	});

	test(name("a reading with no payback figure in it discloses no rate"), () => {
		// Compacted, and nothing sent since: the walk meets no assistant turn, so
		// the transcript names no model and the reading falls back to the default
		// rate. There is nothing here priced at that rate -- no prompt is cached,
		// so no payback figure is printed -- and a rate disclosed over a passage
		// that quotes no number reads as a fact about the compaction beside it.
		const out = read(
			prompt("Read the brief and start on the scanner", at(120), {
				uuid: "kept-1",
			}),
			assistant(150_000, { minutesAgo: 119 }),
			compactBoundary({ minutesAgo: 20, postTokens: 48_631, kept: ["kept-1"] }),
			COMPACT_SUMMARY,
		);

		assert.doesNotMatch(
			out,
			/cache read/,
			"no payback figure, no rate to disclose",
		);
		assert.match(
			out,
			/^Prompt cache, read at \d\d:\d\d \(5m lifetime\)\./,
			"no turn wrote the cache, so the lifetime is the API default",
		);
		assert.match(
			out,
			/The session was compacted at \d\d:\d\d down to 48\.6K tokens, and there is nothing newer to cut at\./,
		);
	});

	test(name("the `/compact` command's own entry is never a cut point"), () => {
		// The harness writes the `/compact` user entry *after* the boundary it
		// caused and stamps it from before it, so the scan reads it as the first
		// prompt of the new context. A rewind there lands on a context whose
		// first message is the compaction summary, which is what the session had
		// just finished doing.
		const out = read(
			prompt("The prompt the compaction kept verbatim", at(120), {
				uuid: "kept-1",
			}),
			assistant(150_000, { minutesAgo: 119 }),
			compactBoundary({ minutesAgo: 40, postTokens: 31_212, kept: ["kept-1"] }),
			COMPACT_SUMMARY,
			prompt(
				"<command-name>/compact</command-name>\n<command-message>compact</command-message>\n<command-args></command-args>",
				at(41),
			),
			assistant(60_000, { minutesAgo: 39 }),
			prompt("Ordinary prompt one", at(35)),
			assistant(100_000, { minutesAgo: 34 }),
			prompt("Ordinary prompt two", at(30)),
			assistant(140_000, { minutesAgo: 29 }),
		);

		assert.doesNotMatch(out, /"\/compact"|command-name/);
		assert.match(
			out,
			/1\. "Ordinary prompt one"\s+sent \d\d:\d\d \| valid until \d\d:\d\d \| 60K tokens before it, keeps 80K, pays back after 30 turns/,
		);
		assert.match(
			out,
			/2\. "Ordinary prompt two"\s+sent \d\d:\d\d \| valid until \d\d:\d\d \| 100K tokens before it, keeps 40K, pays back after 11 turns/,
		);
	});
}
