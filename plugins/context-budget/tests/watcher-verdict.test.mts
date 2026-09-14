// What a verdict is worth once the judge has answered: what the session is
// told, in the words it is told in, and what the judge was shown to arrive at
// it. When the judge is consulted at all is `watcher-gate.test.mts`, and what
// a judge that will not start costs is `watcher-faults.test.mts`.
//
// The advice is the Stop's own output, which Claude Code hands to the model on
// the next turn, so every case here reads it off the run that asked.
import assert from "node:assert/strict";
import { test } from "node:test";
import { runtimes } from "../../../tests/harness.mts";
import { assistant, at, prompt as promptEntry } from "./fixtures.mts";
import { quiet, transcript } from "./harness.mts";
import {
	conversation,
	GOOD,
	injected,
	LATER,
	NEWEST,
	NOTICE,
	watcherRuns,
} from "./watcher-runs.mts";

/** The newest prompt of `conversation`, which the advice quotes. */
const ASKED = "Now wire the verdict into the session record";

for (const runtime of runtimes()) {
	const name = (what: string) => `${runtime}: ${what}`;

	// The advice names the turn the arc was judged after and the judge's own
	// reason; the rest of its wording is left unasserted.
	test(name("a good verdict is what the Stop hands the session"), () => {
		const { judge: seen, session, stop } = watcherRuns(runtime);

		seen.answers(GOOD);

		const said = String(injected(stop(session(), conversation(NOTICE))));

		assert.ok(said.includes(`"${ASKED}"`), said);
		assert.ok(said.includes(GOOD.reason), said);
	});

	// The prompt the advice quotes is read against the `/rewind` picker's own
	// rows, so a slash command is quoted by the name and arguments the user
	// typed rather than by the XML the transcript stores it as.
	test(name("a slash-command prompt is quoted as the picker lists it"), () => {
		const { judge: seen, session, stop } = watcherRuns(runtime);

		seen.answers(GOOD);

		const said = String(injected(stop(session(), commandPrompt())));

		assert.ok(said.includes('began "/review src"'), said);
	});

	// Whether to compact is the session's to judge, so a cut the judge writes
	// anyway is dropped and only its reason is read: the advice matches the same
	// verdict without the cut.
	test(name("a cut the judge names is not relayed"), () => {
		const { judge: seen, session, stop } = watcherRuns(runtime);

		seen.answers(GOOD);

		const plain = injected(stop(session(), conversation(NOTICE)));

		seen.answers({
			...GOOD,
			option: "compact",
			focus: "wiring the watcher into the session record, task #30",
		});

		assert.equal(injected(stop(session(), conversation(NOTICE))), plain);
	});

	// An arc that ended for no stated reason is one the session cannot weigh,
	// so it hears nothing at all.
	test(name("a verdict without a reason is silence"), () => {
		const { judge: seen, session, stop } = watcherRuns(runtime);

		seen.answers({ good: true, reason: "" });

		assert.equal(injected(stop(session(), conversation(NOTICE))), null);
	});

	// The model's own full stop would land beside the sentence's.
	test(name("a reason ending in a full stop is read out with one"), () => {
		const { judge: seen, session, stop } = watcherRuns(runtime);

		seen.answers({ ...GOOD, reason: "the record change is landed." });

		const said = String(injected(stop(session(), conversation(NOTICE))));

		assert.ok(said.includes("the record change is landed."), said);
		assert.ok(!said.includes("the record change is landed.."), said);
	});

	// What `claude -p --output-format json` writes: the model's text in a
	// `result` field. A judge of the user's own writes the object itself, which
	// is the shape every other case here uses.
	test(name("a verdict inside the claude envelope reads the same"), () => {
		const { judge: seen, session, stop } = watcherRuns(runtime);

		seen.answers(GOOD);

		const bare = injected(stop(session(), conversation(NOTICE)));

		seen.answers({
			type: "result",
			subtype: "success",
			is_error: false,
			result: `Here is my answer:\n\`\`\`json\n${JSON.stringify(GOOD)}\n\`\`\``,
		});

		assert.equal(injected(stop(session(), conversation(NOTICE))), bare);
	});

	// The judge rules on the arc and nothing else, so its prompt carries the
	// conversation and no command for it to weigh.
	test(name("the judge is shown the turns and no command"), () => {
		const { judge: seen, session, stop } = watcherRuns(runtime);

		seen.answers(LATER);
		quiet(stop(session(), conversation(NOTICE)));

		const shown = seen.prompts()[0] ?? "";

		assert.ok(shown.includes("<turns>"), "the conversation is shown");
		assert.ok(!shown.includes("/compact"), shown);
	});

	// The judge reads a bounded stretch of conversation however long the
	// session is. The cut comes off the oldest end, so the turn that has just
	// ended, which is the one it is judging, is always in front of it, and it
	// is marked so that the oldest turn shown is read as a fragment rather than
	// as the start of the session.
	test(name("the tail the judge is shown is cut from the oldest end"), () => {
		const { judge: seen, session, stop } = watcherRuns(runtime);

		seen.answers(LATER);
		quiet(stop(session(), longSession()));

		const shown = seen.prompts()[0] ?? "";

		assert.ok(shown.includes("TURN-16"), "the newest turn is shown");
		assert.ok(!shown.includes("TURN-01"), "the oldest turns are cut");
		assert.ok(shown.includes("[earlier turns cut]"), "the cut is marked");
		assert.ok(
			shown.length < 90_000,
			`20K tokens of tail and the rest of the prompt: ${shown.length}`,
		);
	});
}

/**
 * A conversation whose newest prompt is a slash command, stored the way Claude
 * Code stores one: the message it printed, the command's name and its
 * arguments, all inside the prompt's own text.
 */
const commandPrompt = (): string =>
	transcript(
		promptEntry("Read the brief and start on step 1", at(59)),
		assistant(140_000, { minutesAgo: 59 }),
		promptEntry(
			"<command-message>review is running...</command-message><command-name>/review</command-name><command-args>src</command-args>",
			at(20),
		),
		assistant(NOTICE, { minutesAgo: 5, uuid: NEWEST }),
	);

/**
 * Sixteen turns, each far too large to fit the tail whole, and each named so a
 * case can say which of them survived the cut. The newest assistant entry is
 * `NEWEST`, as every other conversation's is.
 */
function longSession(): string {
	const lines: string[] = [];

	for (let n = 1; n <= 16; n += 1) {
		const marked = `TURN-${String(n).padStart(2, "0")}`;

		lines.push(
			promptEntry(
				`${marked} ${"words about the work ".repeat(400)}`,
				at(60 - n),
			),
			assistant(NOTICE, {
				minutesAgo: 60 - n,
				...(n === 16 ? { uuid: NEWEST } : {}),
			}),
		);
	}

	return transcript(...lines);
}
