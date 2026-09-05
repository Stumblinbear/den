// The price table the cut-point reading is figured at: the rates the plugin
// ships, and the file a user writes beside them to correct one that has moved.
//
// What a cached token costs is a fact about the model, published by whoever
// runs it, so it is not configuration and none of the configuration's rules
// reach it. Getting the user file wrong must cost the session nothing but the
// accuracy of one number: it is dropped whole, the shipped rates stand, and
// nothing is said about it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { runtimes } from "../../../tests/harness.mts";
import { assistant, at, prompt } from "./fixtures.mts";
import {
	pricingOverride,
	reading,
	recorder,
	scriptRunner,
	sessionId,
	transcript,
} from "./harness.mts";

/**
 * The same nine turns the payback cases are read against, so the figures here
 * are the shipped ones moving and nothing else.
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
	const name = (what: string) => `${runtime}: ${what}`;

	/** A session whose record points at `path`, as a measured session's does. */
	const measured = (path: string): string => {
		const session = sessionId(runtime);

		measure(session, path);

		return session;
	};

	test(
		name("a user price table replaces the rate the payback is figured at"),
		() => {
			// A table that halves what the model is said to charge for a cached
			// read. Half the saving per turn is nearly twice as long before the
			// write back has been earned: 19 turns becomes 37 and 7 becomes 14.
			const out = reading(
				script(
					measured(paybackTranscript("claude-opus-5")),
					[],
					pricingOverride("default = 0.05\n"),
				),
			);

			assert.match(out, /keeps 90K, pays back after 37 turns/);
			assert.match(out, /keeps 40K, pays back after 14 turns/);
		},
	);

	test(name("a row the shipped table has no key for is tried after it"), () => {
		// `'claude-'` matches every id there is, Fable's included, so where it is
		// tried decides both readings. Behind the shipped rows -- which is where
		// a key the shipped file does not have goes -- it prices Opus and leaves
		// Fable on the row that was written for it; in front of them it would
		// quietly take the exception away.
		const over = pricingOverride("[models]\n'claude-' = 0.5\n");
		const opus = measured(paybackTranscript("claude-opus-5"));
		const fable = measured(paybackTranscript("claude-fable-5-1"));

		assert.match(
			reading(script(opus, [], over)),
			/keeps 90K, pays back after 4 turns/,
			"no shipped row matches Opus, so the added one does",
		);
		assert.match(
			reading(script(fable, [], over)),
			/keeps 90K, pays back after 73 turns/,
			"the shipped `fable` row is tried first and still wins",
		);
	});

	test(name("a price the API cannot charge is dropped whole"), () => {
		// 5 would price a cached token at five fresh ones and read as a cut
		// paying for itself in a turn or two. The file goes, the reading stays --
		// at the rates the plugin ships, and the figures the payback cases assert.
		assert.match(
			reading(
				script(
					measured(paybackTranscript("claude-opus-5")),
					[],
					pricingOverride("default = 5\n"),
				),
			),
			/keeps 90K, pays back after 19 turns/,
		);
	});

	test(
		name("a transcript that names no model takes the table's default"),
		() => {
			// An empty model id is not a model a row can be written for: it is a
			// transcript that says nothing about what it was sent to. A row keyed
			// to match anything -- '.*', '^', '' -- would otherwise take an empty
			// id as a match and price the reading at a rate the opening line then
			// calls the default.
			const out = reading(
				script(
					"",
					[
						"--transcript",
						transcript(
							assistant(110_000, { minutesAgo: 41, model: "" }),
							prompt("Read the brief and start on the scanner", at(40)),
							prompt("Now add the skill that takes a fresh reading", at(36)),
							assistant(200_000, { minutesAgo: 35, model: "" }),
						),
					],
					pricingOverride("[models]\n'.*' = 0.5\n"),
				),
			);

			assert.match(
				out,
				/Prompt cache, read at \d\d:\d\d \(1h lifetime, payback at the default 0\.1x cache read\)\./,
			);
			assert.match(out, /keeps 90K, pays back after 19 turns/);
		},
	);
}
