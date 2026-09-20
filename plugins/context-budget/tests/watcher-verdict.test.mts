// What a verdict is worth once the judge has answered: whether the session is
// told anything, which prompt the advice quotes, and how much the judge was
// shown to arrive at it. When the judge is consulted at all is
// `watcher-gate.test.mts`, and what a judge that will not start costs is
// `watcher-faults.test.mts`.
//
// The advice is the Stop's own output, which Claude Code hands to the model on
// the next turn, so every case here reads it off the run that asked.
import assert from "node:assert/strict";
import { test } from "node:test";
import { runtimes } from "../../../tests/harness.mts";
import { assistant, at, prompt as promptEntry } from "./fixtures.mts";
import { quiet, transcript } from "./harness.mts";
import {
	advice,
	advised,
	conversation,
	GOOD,
	LATER,
	NEWEST,
	NOTICE,
	watcherRuns,
} from "./watcher-runs.mts";

for (const runtime of runtimes()) {
	const name = (what: string) => `${runtime}: ${what}`;

	test(name("a good verdict is handed to the session"), () => {
		const { judge: seen, session, stop } = watcherRuns(runtime);
		const id = session();

		seen.answers(GOOD);

		assert.ok(advised(id, stop(id, conversation(NOTICE))));
	});

	// The advice quotes the prompt as `asTyped` in `lib/rewind-picker.mts` gives
	// it, so a slash command stored as XML and the same command typed bare are
	// one prompt to the session.
	test(name("a slash-command prompt is quoted as the picker lists it"), () => {
		const { judge: seen, session, stop } = watcherRuns(runtime);
		const stored = session();
		const typed = session();

		seen.answers(GOOD);

		const asCommand = advice(stored, stop(stored, asked(COMMAND)));

		assert.ok(asCommand, "the command prompt was advised on");
		assert.equal(advice(typed, stop(typed, asked("/review src"))), asCommand);
	});

	// An arc that ended for no stated reason is one the session cannot weigh,
	// so it hears nothing at all.
	test(name("a verdict without a reason is silence"), () => {
		const { judge: seen, session, stop } = watcherRuns(runtime);

		seen.answers({ good: true, reason: "" });
		quiet(stop(session(), conversation(NOTICE)));
	});

	// The judge reads a stretch of the conversation too long to be shown whole,
	// cut from the oldest end so that the turn that just ended is always in it.
	//
	// The two `[watcher]` defaults are what makes this discriminate. `tail_turns`
	// is sixteen, so all sixteen turns below are read, and at 8,400 characters of
	// prompt each they come to about 135,000 against the 80,000 characters
	// 20,000 `tail_tokens` buys at four characters a token: the oldest turn falls
	// outside the cut on that overrun alone. Lower `tail_turns` and it falls out
	// on the count instead, leaving the case to pass having tested nothing.
	test(name("the tail the judge is shown is cut from the oldest end"), () => {
		const { judge: seen, session, stop } = watcherRuns(runtime);

		seen.answers(LATER);
		quiet(stop(session(), longSession(USUAL, USUAL)));
		quiet(stop(session(), longSession(UNLIKE, USUAL)));
		quiet(stop(session(), longSession(USUAL, UNLIKE)));

		const [shown = "", older = "", newer = ""] = seen.prompts();

		assert.ok(older === shown, "the oldest turn reached the judge");
		assert.ok(newer !== shown, "the newest turn never reached the judge");
		assert.ok(
			shown.length < 90_000,
			`20K tokens of tail and the rest of the prompt: ${shown.length}`,
		);
	});
}

/**
 * A slash command as Claude Code stores one: the message it printed, the
 * command's name and its arguments, all inside the prompt's own text.
 */
const COMMAND =
	"<command-message>review is running...</command-message><command-name>/review</command-name><command-args>src</command-args>";

/**
 * A conversation whose newest prompt is stored as `text`, and whose every entry
 * is otherwise the same, so two of them differ in that storage alone.
 */
const asked = (text: string): string =>
	transcript(
		promptEntry("Read the brief and start on step 1", at(59), {
			uuid: "earlier-prompt",
		}),
		assistant(140_000, { minutesAgo: 59, uuid: "earlier-reply" }),
		promptEntry(text, at(20), { uuid: "newest-prompt" }),
		assistant(NOTICE, { minutesAgo: 5, uuid: NEWEST }),
	);

/** The opening every turn of the baseline session shares. */
const USUAL = "as every other turn";

/** The opening of the one turn a session differs from the baseline in. */
const UNLIKE = "unlike any other turn";

/**
 * Sixteen turns, each far too large to fit the tail whole, the first opening
 * with `oldest`, the last with `newest` and the rest with `USUAL`.
 *
 * The newest assistant entry is `NEWEST`, as every other conversation's is,
 * and every other entry carries a uuid of its own, so two sessions built here
 * differ in those two openings alone.
 */
function longSession(oldest: string, newest: string): string {
	const lines: string[] = [];
	const opening = (n: number): string => {
		if (n === 1) {
			return oldest;
		}

		return n === 16 ? newest : USUAL;
	};

	for (let n = 1; n <= 16; n += 1) {
		lines.push(
			promptEntry(
				`${opening(n)}: ${"words about the work ".repeat(400)}`,
				at(60 - n),
				{ uuid: `long-prompt-${n}` },
			),
			assistant(NOTICE, {
				minutesAgo: 60 - n,
				uuid: n === 16 ? NEWEST : `long-reply-${n}`,
			}),
		);
	}

	return transcript(...lines);
}
