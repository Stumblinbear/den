// What a verdict is worth once the judge has answered: what the session is
// told, in the words it is told in, and what the judge was shown to arrive at
// it. When the judge is consulted at all is `watcher-gate.test.mts`, and what
// a judge that will not start costs is `watcher-faults.test.mts`.
//
// The advice is the Stop's own output, which Claude Code hands to the model on
// the next turn, so every case here reads it off the run that asked.
import assert from "node:assert/strict";
import { dirname } from "node:path";
import { test } from "node:test";
import {
	type Result,
	type Runtime,
	runtimes,
} from "../../../tests/harness.mts";
import { assistant, at, prompt as promptEntry } from "./fixtures.mts";
import {
	configFile,
	DEFAULTS,
	GUARD,
	GUARD_MESSAGES,
	hookRunner,
	MESSAGES,
	quiet,
	sessionId,
	subagentSession,
	transcript,
} from "./harness.mts";
import { judge } from "./judge-fixture.mts";
import {
	conversation,
	GOOD,
	injected,
	LATER,
	NEWEST,
	NOTICE,
	PRICING,
	watcherRuns,
} from "./watcher-runs.mts";

/** The advice the canned verdict comes to, written out here by hand. */
const ADVICE = [
	'Context watcher: after the turn that began "Now wire the verdict into the',
	'session record", the arc looked over: the record change is landed and its',
	"tests are green. It recommends `/compact wiring the watcher into the session",
	"record, task #30`. Invoke the `context-budget` skill and answer it there.",
].join(" ");

for (const runtime of runtimes()) {
	const name = (what: string) => `${runtime}: ${what}`;

	test(name("a good verdict is what the Stop hands the session"), () => {
		const { judge: seen, session, stop } = watcherRuns(runtime);

		seen.answers(GOOD);

		assert.equal(injected(stop(session(), conversation(NOTICE))), ADVICE);
	});

	// Both quotations the advice carries are read against the `/rewind` picker's
	// own rows, so a slash command is quoted by the name and arguments the user
	// typed rather than by the XML the transcript stores it as.
	test(name("a slash-command prompt is quoted as the picker lists it"), () => {
		const { judge: seen, session, stop } = watcherRuns(runtime);

		seen.answers(GOOD);

		const said = String(injected(stop(session(), commandPrompt())));

		assert.ok(said.includes('began "/review src"'), said);
	});

	// A rewind is named to the user by the words the picker's own rows carry,
	// so the judge is asked for the prompt's opening and the hook cuts it to a
	// row either way: a whole prompt quoted into the advice is a paragraph.
	test(name("a rewind verdict is advice at a prompt, cut to a row"), () => {
		const { judge: seen, session, stop } = watcherRuns(runtime);

		seen.answers({
			good: true,
			option: "rewind",
			focus:
				"Read the design at watcher-design.md and start on the watcher, taking the gate first.",
			reason: "the watcher is landed and the round has moved on to its docs",
		});

		const said = String(injected(stop(session(), conversation(NOTICE))));

		assert.ok(
			said.includes(
				'It recommends a rewind summarize at "Read the design at watcher-design.md and start on the watcher, taking...".',
			),
			said,
		);
	});

	// Carrying on is a verdict like the other two: the arc ended and no cut
	// pays for itself, which is worth saying once and then standing on.
	test(name("a carry-on verdict recommends carrying on unchanged"), () => {
		const { judge: seen, session, stop } = watcherRuns(runtime);

		seen.answers({
			good: true,
			option: "carry-on",
			focus: "",
			reason: "the arc ended with too little left to run to pay a cut back",
		});

		const said = String(injected(stop(session(), conversation(NOTICE))));

		assert.ok(said.includes("It recommends carrying on unchanged."), said);
	});

	// The model's own full stop would land beside the sentence's.
	test(name("a reason ending in a full stop is read out with one"), () => {
		const { judge: seen, session, stop } = watcherRuns(runtime);

		seen.answers({ ...GOOD, reason: "the record change is landed." });

		const said = String(injected(stop(session(), conversation(NOTICE))));

		assert.ok(
			said.includes("the record change is landed. It recommends"),
			said,
		);
	});

	// What `claude -p --output-format json` writes: the model's text in a
	// `result` field. A judge of the user's own writes the object itself, which
	// is the shape every other case here uses.
	test(name("a verdict inside the claude envelope reads the same"), () => {
		const { judge: seen, session, stop } = watcherRuns(runtime);

		seen.answers({
			type: "result",
			subtype: "success",
			is_error: false,
			result: `Here is my answer:\n\`\`\`json\n${JSON.stringify(GOOD)}\n\`\`\``,
		});

		assert.equal(injected(stop(session(), conversation(NOTICE))), ADVICE);
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

	// A judge left where the hook stands would load that project's CLAUDE.md,
	// its hooks and its MCP servers on every consultation. The directory it is
	// given instead is the one the configuration was read from, which is the
	// plugin's data directory in every session Claude Code starts.
	test(name("the judge runs where the configuration was read from"), () => {
		const runs = watcherRuns(runtime);

		runs.judge.answers(LATER);
		quiet(runs.stop(runs.session(), conversation(NOTICE)));

		assert.equal(runs.judge.cwd(), dirname(runs.config));
	});

	// Every entry of this plugin returns on the marker, including the watcher
	// itself, so the judge child running a whole Claude Code session of its own
	// fires none of them. The runs without it are what make the silence proof
	// of the marker rather than of anything else.
	test(name("the marker switches every entry off at once"), () => {
		const seen = judge(runtime);
		const every = entries(runtime, seen.config);

		seen.answers(LATER);

		const off = every(true);

		quiet(off.measured);
		quiet(off.watched);
		quiet(off.denied);
		assert.equal(seen.prompts().length, 0, "the judge was never consulted");

		const on = every(false);

		assert.equal(injected(on.measured), "NOTICE 160K over 150K");
		quiet(on.watched);
		assert.equal(seen.prompts().length, 1, "the judge answers without it");
		assert.ok(on.denied.stdout.includes("DENIED"), on.denied.stdout);
	});
}

/** One run of each of this plugin's entries, with the marker set or not. */
interface Entries {
	readonly measured: Result;
	readonly watched: Result;
	readonly denied: Result;
}

/**
 * All three entries of one session, each on input it has something to say
 * about: a crossing to inject, a turn to judge, and a resume to deny.
 */
function entries(runtime: Runtime, watcher: string): (off: boolean) => Entries {
	const hook = hookRunner(runtime);
	const config = configFile(DEFAULTS, MESSAGES, GUARD, GUARD_MESSAGES, watcher);
	const id = sessionId(runtime);
	const path = conversation(NOTICE);
	const guarded = subagentSession("big", [assistant(162_300)], ["{}"]);

	return (off) => {
		const env = off ? { env: { CONTEXT_BUDGET_JUDGE: "1" } } : {};
		const session = { session_id: id, transcript_path: path };

		return {
			measured: hook(
				"context-budget",
				{ ...session, hook_event_name: "UserPromptSubmit" },
				config,
				env,
			),
			watched: hook(
				"watcher",
				{ ...session, hook_event_name: "Stop" },
				config,
				{ ...env, args: PRICING },
			),
			denied: hook(
				"resume-guard",
				{
					session_id: id,
					hook_event_name: "PreToolUse",
					tool_name: "SendMessage",
					tool_input: { to: "big" },
					transcript_path: guarded,
				},
				config,
				env,
			),
		};
	};
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
