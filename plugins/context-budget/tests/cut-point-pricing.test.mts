// What a cut costs and when it has paid for itself.
//
// A rewind is not free: the first request after it writes everything the cut
// kept back to the cache, at twice a fresh input token on the one-hour
// lifetime where carrying on would have read that same stretch at the read
// rate, and only then starts saving the read of what it summarized away, once
// per turn. So the same cut is worth taking in a session with forty turns left
// in it and not in one with four. On the tier that reads at a quarter of the
// usual price it takes about four times as long to come good.
//
// The rates themselves, and the file a user corrects one in, are
// `pricing.test.mts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { runtimes } from "../../../tests/harness.mts";
import { apiError, assistant, at, prompt } from "./fixtures.mts";
import {
	reading,
	recorder,
	scriptRunner,
	sessionId,
	transcript,
} from "./harness.mts";

/**
 * Nine turns, with two prompts priced against different points in them: the
 * older keeps most of the context and pays back slowly, the newer keeps little
 * and pays back quickly.
 */
const paybackTranscript = (model: string): string =>
	transcript(
		assistant(80_000, { minutesAgo: 200, model }),
		prompt("The prompt from before lunch", at(190)),
		assistant(110_000, { minutesAgo: 41, model }),
		prompt("Read the brief and start on the scanner", at(40)),
		assistant(120_000, { minutesAgo: 39, model }),
		assistant(140_000, { minutesAgo: 38, model }),
		assistant(160_000, { minutesAgo: 37, model }),
		prompt("Now add the skill that takes a fresh reading", at(36)),
		assistant(180_000, { minutesAgo: 35, model }),
		assistant(190_000, { minutesAgo: 34, model }),
		assistant(195_000, { minutesAgo: 33, model }),
		assistant(198_000, { minutesAgo: 32, model }),
		assistant(200_000, { minutesAgo: 31, model }),
	);

for (const runtime of runtimes()) {
	const script = scriptRunner(runtime);
	const measure = recorder(runtime);
	const sid = () => sessionId(runtime);
	const name = (what: string) => `${runtime}: ${what}`;
	const read = (...lines: readonly string[]) =>
		reading(script("", ["--transcript", transcript(...lines)]));

	/** A session whose record points at `path`, as a measured session's does. */
	const measured = (path: string): string => {
		const session = sid();

		measure(session, path);

		return session;
	};

	test(name("each cut point carries the turns it takes to pay back"), () => {
		// (2 - 0.1) x 90K to write back what carrying on would have read, plus
		// 0.1 x 110K read on the way past, plus 20K for the summary, against
		// 0.1 x 110K saved on every turn after it: 19 turns.
		const out = reading(script(measured(paybackTranscript("claude-opus-5"))));

		assert.match(
			out,
			/1\. "Read the brief and start on the scanner"\s+sent \d\d:\d\d \| valid until \d\d:\d\d \| 110K tokens before it, keeps 90K, pays back after 19 turns/,
		);
		assert.match(
			out,
			/2\. "Now add the skill that takes a fresh reading"\s+sent \d\d:\d\d \| valid until \d\d:\d\d \| 160K tokens before it, keeps 40K, pays back after 7 turns/,
			"a cut that keeps less costs less to write back and comes good sooner",
		);
		assert.doesNotMatch(
			out,
			/default 0\.1x cache read/,
			"the record names the model, so the rate is that model's row and not a guess",
		);
	});

	test(
		name("the same cut points on Fable take about four times as long"),
		() => {
			// The identical transcript under the id the `fable` row matches. That
			// tier reads a cached token at 0.025 against 0.1, so every turn saves a
			// quarter as much. The write back costs a shade more too, since the
			// read it replaces was cheaper.
			const out = reading(
				script(measured(paybackTranscript("claude-fable-5-1"))),
			);

			assert.match(out, /keeps 90K, pays back after 73 turns/);
			assert.match(out, /keeps 40K, pays back after 26 turns/);
		},
	);

	test(
		name("the transcript being read names the model, not its reader"),
		() => {
			// `--transcript` is how a session reads a transcript that is not its own,
			// and the record beside it belongs to the reader rather than to what is
			// being read. Pricing off the record would put this Fable transcript on
			// the reader's Opus rate and understate every cut point fourfold.
			const session = measured(paybackTranscript("claude-opus-5"));
			const out = reading(
				script(session, [
					"--transcript",
					paybackTranscript("claude-fable-5-1"),
				]),
			);

			assert.match(out, /keeps 90K, pays back after 73 turns/, "Fable's rate");
			assert.match(out, /keeps 40K, pays back after 26 turns/);
			assert.doesNotMatch(
				out,
				/cache read\)/,
				"a model is named, so none is assumed",
			);
		},
	);

	test(
		name("a transcript that names no model says which rate it fell back to"),
		() => {
			// Every turn in it carries an empty model id, which matches no row. The
			// reading is still worth printing, but a payback figure is only worth
			// as much as the rate behind it, and on the one tier that reads at a
			// quarter of the usual price it would be out by a factor of four, so
			// the rate it settled for goes in the opening line.
			const out = read(
				assistant(110_000, { minutesAgo: 41, model: "" }),
				prompt("Read the brief and start on the scanner", at(40)),
				prompt("Now add the skill that takes a fresh reading", at(36)),
				assistant(200_000, { minutesAgo: 35, model: "" }),
			);

			assert.match(
				out,
				/Prompt cache, read at \d\d:\d\d \(1h lifetime, payback at the default 0\.1x cache read\)\./,
			);
			assert.match(out, /keeps 90K, pays back after 19 turns/);
		},
	);

	test(name("a failed request is not the turn the model is read from"), () => {
		// A request that never reached the model is written as an assistant entry
		// all the same, with every usage field zero, and the synthetic id it
		// carries ("<synthetic>") matches no row. A reading that took the model
		// from the newest entry rather than from the newest turn would quietly
		// price Fable's cut points at four times what they save.
		const fable = { model: "claude-fable-5-1" };
		const out = read(
			assistant(200_000, { minutesAgo: 45, ...fable }),
			prompt("Read the brief and start on the scanner", at(40)),
			prompt("Now add the skill that takes a fresh reading", at(20)),
			assistant(500_000, { minutesAgo: 19, ...fable }),
			apiError({ minutesAgo: 5 }),
		);

		assert.match(
			out,
			/"Now add the skill that takes a fresh reading"[\s\S]*?200K tokens before it, keeps 300K, pays back after 124 turns/,
		);
		assert.doesNotMatch(
			out,
			/cache read\)/,
			"the transcript names the model, so no rate is being assumed",
		);
	});

	test(
		name("a failed request is not the turn a prompt is priced against"),
		() => {
			// The same failure in the middle of the transcript: it carried no context
			// and wrote no cache entry, so the prompt below it is priced against the
			// turn above it, the last one that really ran.
			const wired = at(20);
			const out = read(
				assistant(100_000, { minutesAgo: 45 }),
				prompt("Read the brief and start on the scanner", at(40)),
				apiError({ minutesAgo: 39 }),
				prompt("Now add the skill that takes a fresh reading", wired),
				assistant(200_000, { minutesAgo: 19 }),
			);

			assert.match(
				out,
				/1\. "Now add the skill that takes a fresh reading"[\s\S]*?100K tokens before it, keeps 100K, pays back after 22 turns/,
				"the 100K turn wrote the prefix a cut there re-reads, and the context is 200K",
			);
		},
	);

	test(
		name(
			"a prefix behind a turn that wrote nothing lives as long as the write",
		),
		() => {
			// A request served entirely from the cache writes nothing back to it: the
			// entry the prompt below it would be rewound to was written by an older
			// request, and a read refreshes an entry without changing how long it
			// lives. So the lifetime is that older request's, which is not the
			// session's current one if the setting changed since.
			const cold = read(
				assistant(100_000, { minutesAgo: 45, ttl: "5m" }),
				prompt("Read the brief and start on the scanner", at(40)),
				assistant(150_000, { minutesAgo: 39, ttl: null }),
				prompt("Now add the skill that takes a fresh reading", at(20)),
				assistant(200_000, { minutesAgo: 19, ttl: "1h" }),
			);

			assert.match(
				cold,
				/no cut point is still cached/,
				"its prefix was written under 5m, 39 minutes ago, so it is not cached",
			);
			assert.doesNotMatch(cold, /Now add the skill/);
		},
	);

	test(
		name("a cut on the five-minute lifetime writes back at the cheaper rate"),
		() => {
			// The write back is 1.25 fresh tokens on the five-minute lifetime against
			// 2 on the hour, and it is the lifetime in force now that prices it: the
			// rewind's own write happens now, whatever the prefix it re-reads was
			// written under. (1.25 - 0.1) x 50K + 0.1 x 150K + 20K over 0.1 x 150K is
			// 7 turns; at the hour's rate it would be 9.
			assert.match(
				read(
					assistant(100_000, { minutesAgo: 20, ttl: "5m" }),
					prompt("A prompt from a while ago", at(19)),
					assistant(150_000, { minutesAgo: 4, ttl: "5m" }),
					prompt("The prompt still inside the five minutes", at(3)),
					assistant(200_000, { minutesAgo: 2, ttl: "5m" }),
				),
				/1\. "The prompt still inside the five minutes"\s+sent \d\d:\d\d \| valid until \d\d:\d\d \| 150K tokens before it, keeps 50K, pays back after 7 turns/,
			);
		},
	);
}
