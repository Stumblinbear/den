// The two rows in a reading that are not cut points: `/compact`, priced as a
// cut at the tail Claude Code keeps rather than at a prompt the user selects,
// and carrying on, which is what one more turn of the context costs and what
// every payback above it is measured against. Both stand whether or not a cut
// point is left cached.
//
// Where the `/compact` tail figure comes from is most of what there is to get
// right: it is never known before the command runs, so a compaction the
// session has already made is the measurement and a constant stands in where
// there is none. A rewind summarize writes the same boundary and measures
// nothing about a compaction.
//
// The cut rows beside them are `cut-point.test.mts`, what a cut at a prompt
// costs is `cut-point-pricing.test.mts`, and what the reading says about a
// compaction otherwise is `cut-point-compaction.test.mts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { runtimes } from "../../../tests/harness.mts";
import {
	assistant,
	at,
	CACHED_SESSION,
	COMPACT_SUMMARY,
	compactBoundary,
	prompt,
	toolResult,
} from "./fixtures.mts";
import { reading, scriptRunner, transcript } from "./harness.mts";

for (const runtime of runtimes()) {
	const script = scriptRunner(runtime);
	const name = (what: string) => `${runtime}: ${what}`;
	const read = (...lines: readonly string[]) =>
		reading(script("", ["--transcript", transcript(...lines)]));

	test(name("`/compact` and carrying on are priced beside the cuts"), () => {
		// A payback on the cut points alone is two figures weighed against two
		// options carrying none, which is how a rewind gets recommended where
		// `/compact` would do. Here it is 4 turns against the cuts' 22 and 9.
		const out = read(...CACHED_SESSION);

		assert.match(
			out,
			/1\. `\/compact <focus line>`\s+tail assumed, none measured here \| summarizes 185K tokens, keeps about 15K, pays back after 4 turns/,
		);
		assert.match(
			out,
			/2\. "Read the brief and start on the scanner"[\s\S]*?100K tokens before it, keeps 100K, pays back after 22 turns/,
		);
		assert.match(
			out,
			/4\. carry on\s+nothing summarized, nothing written back \| 20K tokens a turn, 200K of context at the cache read rate/,
		);
	});

	test(
		name("the `/compact` row takes its tail from the session's own compaction"),
		() => {
			// What the next `/compact` keeps is Claude Code's to size and is never
			// known before it runs, so the row is an estimate however it is
			// arrived at. A session that has been compacted has measured one: what
			// its own compaction left behind is what the request after it wrote
			// back to the cache, which is the term this row prices. Here that is
			// 30K against the 15K a session with none assumes, and the row says
			// which of the two it used.
			const out = read(
				assistant(100_000, { minutesAgo: 50 }),
				prompt("A prompt the compaction kept verbatim", at(45), {
					uuid: "kept-1",
				}),
				compactBoundary({
					minutesAgo: 32,
					postTokens: 30_000,
					kept: ["kept-1"],
				}),
				COMPACT_SUMMARY,
				assistant(120_000, { minutesAgo: 30 }),
				prompt("The first prompt after the compaction", at(25)),
				assistant(200_000, { minutesAgo: 24 }),
			);

			assert.match(
				out,
				/1\. `\/compact <focus line>`\s+tail from the compaction at \d\d:\d\d \| summarizes 170K tokens, keeps about 30K, pays back after 6 turns/,
			);
			assert.doesNotMatch(
				out,
				/tail assumed/,
				"there is a compaction here to measure, so nothing is assumed",
			);
		},
	);

	test(
		name("a rewind summarize is no measurement of what `/compact` keeps"),
		() => {
			// A rewind summarize writes the same boundary a compaction does, and
			// what it left behind is whatever stretch the user rewound to: 120K
			// here. Reading that as the tail the next `/compact` would keep prices
			// a rewind and calls it `/compact`, and the figure it comes to steers
			// away from `/compact` in exactly the sessions that have just used the
			// picker.
			const out = read(
				assistant(100_000, { minutesAgo: 50 }),
				prompt("A prompt the rewind kept verbatim", at(45), {
					uuid: "kept-1",
				}),
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

			assert.match(
				out,
				/1\. `\/compact <focus line>`\s+tail assumed, none measured here \| summarizes 185K tokens, keeps about 15K, pays back after 4 turns/,
			);
			assert.doesNotMatch(
				out,
				/tail from the compaction/,
				"the boundary above is a rewind's, which measures nothing about a compaction",
			);
		},
	);

	test(
		name("a compaction that kept nothing still prices the two ways on"),
		() => {
			// No prompt was kept verbatim, so there is no rewind on offer at any
			// price, and the prompt sent since has gone cold. That leaves the same
			// two options a session with no compaction at all has, and the session
			// has been idle long enough to need them: a reading that says only what
			// the compaction cost leaves the agent with a sentence about the past
			// and no figure to act on.
			const out = read(
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

			assert.match(
				out,
				/The session was compacted at \d\d:\d\d down to 11\.3K tokens, and there is nothing newer to cut at\./,
			);
			assert.match(
				out,
				/1\. `\/compact <focus line>`\s+tail from the compaction at \d\d:\d\d \| summarizes 188\.7K tokens, keeps about 11\.3K, pays back after 3 turns/,
			);
			assert.match(
				out,
				/2\. carry on\s+nothing summarized, nothing written back \| 20K tokens a turn, 200K of context at the cache read rate/,
			);
		},
	);

	test(
		name("the other rewind direction is no measurement of one either"),
		() => {
			// "Summarize from here" keeps everything before the prompt the user
			// picked and writes its summary after it, so its boundary carries on
			// from the end of what it kept, as a compaction's does. What separates
			// them is the other end: a compaction keeps a recent tail with
			// conversation above it, and this one kept the head, with nothing above.
			//
			// The entries below are reasoned from what that direction keeps rather
			// than copied from a captured transcript.
			const out = read(
				// Every real transcript opens with entries of this kind above its
				// first prompt, so the head of the conversation still has lines
				// above it in the file, and a walk that stopped at the first of
				// them would read this boundary as a compaction.
				JSON.stringify({
					type: "queue-operation",
					operation: "enqueue",
					timestamp: at(61),
				}),
				prompt("The prompt the rewind summarized from", at(60), {
					uuid: "kept-1",
				}),
				compactBoundary({
					minutesAgo: 40,
					postTokens: 120_000,
					kept: ["kept-1"],
				}),
				COMPACT_SUMMARY,
				assistant(140_000, { minutesAgo: 30 }),
				prompt("The first prompt after the rewind", at(25)),
				assistant(200_000, { minutesAgo: 24 }),
			);

			assert.match(
				out,
				/1\. `\/compact <focus line>`\s+tail assumed, none measured here \| summarizes 185K tokens, keeps about 15K, pays back after 4 turns/,
			);
			assert.doesNotMatch(
				out,
				/tail from the compaction/,
				"what it kept is the head of the context, which is no tail",
			);
		},
	);

	test(
		name("a session with nothing cached left is down to two priced options"),
		() => {
			const out = read(
				assistant(100_000, { minutesAgo: 55, ttl: "5m" }),
				prompt("Read the brief and start on the scanner", at(50)),
				assistant(200_000, { minutesAgo: 30, ttl: "5m" }),
			);

			assert.match(out, /Prompt cache, read at.*5m lifetime/);
			assert.match(
				out,
				/no cut point is still cached, so a rewind re-reads its whole prefix at full price wherever it lands\./,
			);
			// Both of the two carry a figure, and the figures are what the choice
			// is made on: a `/compact` is not worth running in a session with
			// fewer turns left in it than its payback.
			assert.match(
				out,
				/1\. `\/compact <focus line>`\s+tail assumed, none measured here \| summarizes 185K tokens, keeps about 15K, pays back after 4 turns\s+2\. carry on\s+nothing summarized, nothing written back \| 20K tokens a turn, 200K of context at the cache read rate/,
			);
		},
	);
}
