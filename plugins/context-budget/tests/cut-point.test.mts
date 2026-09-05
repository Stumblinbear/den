// End-to-end tests for the cut-point script: a real process, run the way the
// skill's preamble runs it. What it has to get right is the list: which
// prompts a rewind could land on, in what order, and what each one moves. It
// has to say something useful when there is no list to give, too, since its
// output is read as prose by an agent that has no other way to tell what went
// wrong.
//
// How it finds the transcript is `session-record.test.mts`, what it says about
// a compaction is `cut-point-compaction.test.mts`, and what it prices a cut at
// is `cut-point-pricing.test.mts`.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { fixtureDir, runtimes } from "../../../tests/harness.mts";
import { assistant, at, HOUR, hhmm, prompt, toolResult } from "./fixtures.mts";
import { reading, scriptRunner, transcript } from "./harness.mts";

const opened = at(50);
const started = at(35);

/** Two cached prompts an hour apart from expiry, with a cold one above them. */
const SESSION: readonly string[] = [
	assistant(80_000, { minutesAgo: 200 }),
	prompt("The prompt from before lunch", at(190)),
	assistant(100_000, { minutesAgo: 55 }),
	prompt("Read the brief and start on the scanner", opened),
	assistant(150_000, { minutesAgo: 40 }),
	prompt("Now add the skill that takes a fresh reading", started),
	assistant(200_000, { minutesAgo: 30 }),
];

/**
 * The rows that session comes to. Its context is 200K, so what a cut keeps is
 * 200K less what it summarizes away.
 */
const SESSION_ROWS = new RegExp(
	`1\\. "Read the brief and start on the scanner"\\s+` +
		`sent ${hhmm(opened)} \\| valid until ${hhmm(opened, HOUR)} \\| 100K tokens before it, keeps 100K, pays back after 22 turns\\s+` +
		`2\\. "Now add the skill that takes a fresh reading"\\s+` +
		`sent ${hhmm(started)} \\| valid until ${hhmm(started, HOUR)} \\| 150K tokens before it, keeps 50K, pays back after 9 turns`,
);

const COLD_ABOVE =
	/every prompt before it is not, and a rewind there re-reads its whole prefix at full price/;

for (const runtime of runtimes()) {
	const script = scriptRunner(runtime);
	const name = (what: string) => `${runtime}: ${what}`;
	/** A hand run against a transcript, which is how most of these read one. */
	const read = (...lines: readonly string[]) =>
		reading(script("", ["--transcript", transcript(...lines)]));

	test(
		name("lists the cached cut points oldest first, with what each one moves"),
		() => {
			const out = read(...SESSION);

			// Read by hand from a path, and priced from that path all the same:
			// the transcript's own turns name the model, so nothing is being
			// assumed and the opening line has no rate to disclose.
			assert.match(
				out,
				/Prompt cache, read at \d\d:\d\d \(1h lifetime\)\. Cached prompts, oldest first:/,
			);
			assert.match(out, SESSION_ROWS);
			assert.doesNotMatch(
				out,
				/before lunch/,
				"the cold prompt above them is not a cut point",
			);
			assert.match(out, COLD_ABOVE);
		},
	);

	test(name("a prompt with no turn after it yet is not a cut point"), () => {
		// The same session read while the newest prompt is still in flight: no
		// turn has answered it, so its prefix is the whole current context and a
		// cut there keeps nothing verbatim, which is `/compact` by another name.
		const out = read(
			...SESSION,
			prompt("was there anything still pending?", at(2)),
		);

		assert.doesNotMatch(
			out,
			/still pending/,
			"a cut at the prompt in flight keeps nothing, so it is no choice at all",
		);
		assert.match(
			out,
			SESSION_ROWS,
			"the reading is the one the same session gives with nothing in flight",
		);
		assert.doesNotMatch(out, /^ *3\./m, "and there is no third row");
	});

	test(name("a prompt that opens the context is left off the list"), () => {
		// A cut at the first prompt of the context summarizes nothing away, so
		// it prices a rewind nobody would ask for. The entries below it are a
		// different matter: each has the prompts above it to be cut at instead.
		const out = read(
			assistant(100_000, { minutesAgo: 55 }),
			prompt("Read the brief and start on the scanner", at(50)),
			assistant(150_000, { minutesAgo: 40 }),
			prompt("Now add the skill that takes a fresh reading", started),
			assistant(200_000, { minutesAgo: 30 }),
		);

		assert.match(
			out,
			new RegExp(
				`1\\. "Now add the skill that takes a fresh reading"\\s+` +
					`sent ${hhmm(started)} \\| valid until ${hhmm(started, HOUR)} \\| 150K tokens before it, keeps 50K, pays back after 9 turns`,
			),
		);
		assert.doesNotMatch(out, /Read the brief and start on the scanner/);
		assert.match(out, /Every prompt in the context is cached\./);
	});

	test(
		name(
			"a context with one prompt behind its newest turn has nothing to cut at",
		),
		() => {
			// The prompt that opens the context summarizes nothing away and the
			// one in flight keeps nothing, so the list is empty for a reason that
			// is not "the cache has expired". A bare "every prompt in the context
			// is cached" over an empty list reads as exactly that.
			const out = read(
				assistant(100_000, { minutesAgo: 45 }),
				prompt("Start on the cache-aware cut points now", at(40)),
				assistant(200_000, { minutesAgo: 19 }),
				prompt("was there anything still pending?", at(2)),
			);

			assert.doesNotMatch(out, /still pending/);
			assert.match(
				out,
				/Prompt cache, read at \d\d:\d\d \(1h lifetime\)\. Every prompt in the context is cached; the only one with a turn after it is its first, so there is nothing to cut at yet\./,
			);
		},
	);

	test(
		name("the list is three prompts spread across the context, not the clock"),
		() => {
			// A busy stretch: five prompts, all in the cache. Listing every one is
			// a page of rows that say the same thing, and the three worth choosing
			// between are the ones that cut the context in different places
			// rather than at different times. Prompt 3 is the middle by size and
			// prompt 2 is the middle by clock.
			const out = read(
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
				[...out.matchAll(/"Prompt number (\d)"/g)].map((one) => one[1]),
				["0", "3", "4"],
				"the oldest, the one closest to halfway between their prefixes, and the newest",
			);
			assert.match(
				out,
				/"Prompt number 3"\s+sent \d\d:\d\d \| valid until \d\d:\d\d \| 140K tokens before it, keeps 60K, pays back after 11 turns/,
			);
			assert.match(out, /Every prompt after the first is cached too, unless/);
		},
	);

	test(
		name("user entries the rewind picker would not list are never named"),
		() => {
			const out = read(
				// Cold, and above everything else: it keeps the one prompt below from
				// being the first of the context, which would take it off the list on
				// grounds that have nothing to do with the picker.
				assistant(60_000, { minutesAgo: 200 }),
				prompt("The stale prompt from hours ago", at(190)),
				assistant(100_000, { minutesAgo: 50 }),
				toolResult("Reading the file the picker never offers", at(45)),
				prompt("A meta entry the harness wrote", at(44), { isMeta: true }),
				prompt(
					"<task-notification>\n<task-id>abc</task-id>\n</task-notification>",
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

			assert.match(
				out,
				/1\. "The one prompt the user actually typed"\s+sent \d\d:\d\d \| valid until \d\d:\d\d \| 100K tokens before it, keeps 100K, pays back after 22 turns/,
			);

			for (const ineligible of [
				/picker never offers/,
				/meta entry/,
				/task-notification/,
				/relayed subagent/,
				/transcript only/,
				/Request interrupted/,
			]) {
				assert.doesNotMatch(out, ineligible);
			}
		},
	);

	test(
		name("a transcript that cannot be read is explained, not thrown"),
		() => {
			// The scan throws on a file it cannot open, and what the agent has in
			// front of it is this script's stdout: a stack trace on stderr and an
			// empty reading would leave it nothing to say and no reason why.
			const missing = join(fixtureDir("no-session"), "no-session-here.jsonl");

			assert.match(
				reading(script("", ["--transcript", missing])),
				/could not be read \(ENOENT\), so the cache window is unknown/,
			);
		},
	);

	test(name("a session with nothing cached left points at `/compact`"), () => {
		const out = read(
			assistant(100_000, { minutesAgo: 55, ttl: "5m" }),
			prompt("Read the brief and start on the scanner", at(50)),
			assistant(200_000, { minutesAgo: 30, ttl: "5m" }),
		);

		assert.match(out, /Prompt cache, read at.*5m lifetime/);
		assert.match(out, /no cut point is still cached/);
		assert.match(out, /Recommend `\/compact <focus line>` instead\./);
	});

	test(
		name("nothing cached counts cut points, not the prompt in flight"),
		() => {
			// The same empty list with a prompt still in flight: its prefix is the
			// whole context, written a minute ago and cached, so the reading may not
			// say no prompt is. What is empty is the choice: every prompt anyone
			// would cut at has gone cold.
			assert.match(
				read(
					assistant(100_000, { minutesAgo: 55, ttl: "5m" }),
					prompt("Read the brief and start on the scanner", at(50)),
					assistant(200_000, { minutesAgo: 1, ttl: "5m" }),
					prompt("was there anything still pending?", at(0.5)),
				),
				/no cut point is still cached, so any rewind re-reads its whole prefix at full price\. Recommend `\/compact <focus line>` instead\./,
			);
		},
	);
}
