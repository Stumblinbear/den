// The cut-point script as a process: a real run, the way the skill's preamble
// runs it. What it has to get right is the wiring around a reading, which is
// finding the transcript, loading the price files, and never handing the agent
// a stack trace where a sentence belongs.
//
// It asserts on no wording. What the reading says is settled by `readingOf`
// and checked in `reading.test.mts`, what a cut costs by `payback.test.mts`,
// and which prompts are cut points by `prompt-cache.test.mts`. The one case
// that reaches for the text compares it against the same reading built in
// process, so a rename moves both sides at once and pins neither.
//
// The messages for a session with no record and a transcript that cannot be
// read are prose an agent reads instead of a list, so what is pinned here is
// that the run survives to print one and says something: a stack trace on
// stderr and an empty stdout would leave the agent nothing to say and no
// reason why.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { fixtureDir, runtimes } from "../../../tests/harness.mts";
import { cacheReading } from "../lib/cache-reading.mts";
import { loadPricing } from "../lib/pricing.mts";
import { scanCacheWindow } from "../lib/prompt-cache.mts";
import { CACHED_SESSION } from "./fixtures.mts";
import { PLUGIN, recorder, sessionId, transcript } from "./harness.mts";
import { reading, scriptRunner } from "./script-runs.mts";

for (const runtime of runtimes()) {
	const script = scriptRunner(runtime);
	const measure = recorder(runtime);
	const name = (what: string) => `${runtime}: ${what}`;

	test(
		name("prints the reading of the transcript it was pointed at"),
		async () => {
			// The whole of what the script adds to a reading: the transcript to read
			// and the rates to price it at, both off the command line the preamble
			// builds. Built in process from the same file and the same shipped table,
			// the two have to come out the same string.
			const path = transcript(...CACHED_SESSION);
			const pricing = await loadPricing({
				shipped: join(PLUGIN, "lib", "pricing.toml"),
				overrides: null,
			});

			assert.equal(
				reading(script("", ["--transcript", path])).trimEnd(),
				cacheReading(scanCacheWindow(path), pricing).trimEnd(),
			);
		},
	);

	test(name("finds the transcript through the session's own record"), () => {
		// The live path: the preamble passes `--session`, and the measurement
		// hook has written where that session's transcript is.
		const session = sessionId(runtime);

		measure(session, transcript(...CACHED_SESSION));

		assert.notEqual(reading(script(session)).trim(), "");
	});

	test(name("a session with no record is explained, not left blank"), () => {
		// No hook has ever measured this session, so there is no record to point
		// at a transcript. The agent has nothing but this script's stdout, and an
		// empty one reads as a session with nothing cached.
		assert.notEqual(reading(script(sessionId(runtime))).trim(), "");
	});

	test(
		name("a transcript that cannot be read is explained, not thrown"),
		() => {
			// The scan throws on a file it cannot open. What reaches the agent is
			// stdout, so the throw has to become a sentence before it gets there.
			const missing = join(fixtureDir("no-session"), "no-session-here.jsonl");

			assert.notEqual(
				reading(script("", ["--transcript", missing])).trim(),
				"",
			);
		},
	);
}
