// What the measurement hook injects, exercised through the launcher -- the
// exact command `hooks.json` runs. Everything it reads is a file path or
// stdin, so there is nothing to stub, and the bugs these cover -- a stale
// measurement, a level that never re-arms -- live in the interaction between
// the transcript, the level record and the configuration rather than in any
// one function. Every expected text is written by the test that expects it.
//
// The record a case starts from is the one an earlier run of the same session
// left, so no case writes into the hook's own state.
import assert from "node:assert/strict";
import { test } from "node:test";
import { type Result, runtimes } from "../../../tests/harness.mts";
import {
	assistantTurn,
	configFile,
	DEFAULTS,
	GUARD,
	GUARD_MESSAGES,
	hookRunner,
	MESSAGES,
	noTranscript,
	quiet,
	reported,
	sessionId,
	transcript,
} from "./harness.mts";

// What `/compact`, auto-compact and a rewind summarize all append: a boundary
// entry and a summary entry, with no assistant entry after them.
const COMPACT_BOUNDARY = JSON.stringify({
	type: "system",
	subtype: "compact_boundary",
	content: "Conversation compacted",
	level: "info",
	compactMetadata: { trigger: "manual", preTokens: 260000, postTokens: 11304 },
});

const COMPACT_SUMMARY = JSON.stringify({
	type: "user",
	isSidechain: false,
	isCompactSummary: true,
	message: { role: "user", content: "This session is being continued..." },
});

interface Injection {
	readonly hookSpecificOutput?: { readonly additionalContext?: string };
}

const CONFIG = configFile(DEFAULTS, MESSAGES, GUARD, GUARD_MESSAGES);

/** A config fault is what a run that has reported nothing yet still reports. */
const BROKEN_CONFIG = configFile("[resume-guard\nlarge = 10\n");

const prompt = (session: string, path: string) => ({
	session_id: session,
	transcript_path: path,
	hook_event_name: "UserPromptSubmit",
});

function injected(result: Result): string | null {
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stderr, "");

	if (result.stdout === "") {
		return null;
	}

	const output = JSON.parse(result.stdout) as Injection;

	return output.hookSpecificOutput?.additionalContext ?? null;
}

for (const runtime of runtimes()) {
	const hook = hookRunner(runtime);
	const sid = () => sessionId(runtime);
	const name = (what: string) => `${runtime}: ${what}`;
	const run = (session: string, path: string, config = CONFIG) =>
		hook("context-budget", prompt(session, path), config);

	// Claude Code names the path this hook reads, and a path it has named is
	// not always a file: a transcript moved or deleted under the session is
	// nothing to measure rather than a run to fail. Nothing is reported for it
	// either, which the config fault after it is the proof of -- a session that
	// had already been told something would hear nothing more.
	test(name("a transcript that is not there measures nothing"), () => {
		const session = sid();

		quiet(run(session, noTranscript()));
		reported(
			run(session, transcript(assistantTurn(200_000)), BROKEN_CONFIG),
			"config",
		);
	});

	test(name("injects once when the context first crosses notice"), () => {
		const session = sid();
		const path = transcript(assistantTurn(200_000));

		assert.equal(injected(run(session, path)), "NOTICE 200K over 150K");
		assert.equal(
			injected(run(session, path)),
			null,
			"the same level must not inject twice",
		);
	});

	// Every rung speaks once: reaching urgent through notice, which is how a
	// session that is not compacting reaches it, has to inject at both.
	test(name("a climb through notice to urgent injects at each level"), () => {
		const session = sid();

		assert.equal(
			injected(run(session, transcript(assistantTurn(200_000)))),
			"NOTICE 200K over 150K",
		);
		assert.equal(
			injected(run(session, transcript(assistantTurn(260_000)))),
			"URGENT 260K over 250K",
		);
	});

	test(
		name(
			"a compaction resets the record instead of measuring the turn before it",
		),
		() => {
			const session = sid();

			assert.equal(
				injected(run(session, transcript(assistantTurn(200_000)))),
				"NOTICE 200K over 150K",
			);
			assert.equal(
				injected(
					run(
						session,
						transcript(
							assistantTurn(260_000),
							COMPACT_BOUNDARY,
							COMPACT_SUMMARY,
						),
					),
				),
				null,
				"the turn before the boundary is not this context",
			);
			// The record is back to nothing, so the rebuilt context announces
			// itself from `notice`.
			assert.equal(
				injected(run(session, transcript(assistantTurn(200_000)))),
				"NOTICE 200K over 150K",
			);
		},
	);

	// Belt and braces for the same event: the record has to clear off the
	// summary entry alone, without the hook having to trust that every
	// compaction path writes a boundary entry first.
	test(name("a compaction summary alone resets the record"), () => {
		const session = sid();

		assert.equal(
			injected(run(session, transcript(assistantTurn(200_000)))),
			"NOTICE 200K over 150K",
		);
		assert.equal(
			injected(
				run(session, transcript(assistantTurn(260_000), COMPACT_SUMMARY)),
			),
			null,
			"the summarized-away turn is not this context",
		);
		assert.equal(
			injected(run(session, transcript(assistantTurn(200_000)))),
			"NOTICE 200K over 150K",
			"the record is back to nothing, so notice speaks again",
		);
	});

	test(name("urgent re-arms after the context falls back to notice"), () => {
		const session = sid();

		assert.equal(
			injected(run(session, transcript(assistantTurn(260_000)))),
			"URGENT 260K over 250K",
		);
		assert.equal(
			injected(run(session, transcript(assistantTurn(200_000)))),
			null,
			"a fall injects nothing",
		);
		assert.equal(
			injected(run(session, transcript(assistantTurn(260_000)))),
			"URGENT 260K over 250K",
			"climbing past urgent again must inject again",
		);
	});

	// A row switched off is the whole plugin off for the models it matches.
	test(name("a row with `enabled = false` measures nothing"), () => {
		const off = configFile(
			DEFAULTS,
			"[models.'fable']\nenabled = false\n",
			MESSAGES,
			GUARD,
			GUARD_MESSAGES,
		);

		assert.equal(
			injected(run(sid(), transcript(assistantTurn(260_000)), off)),
			null,
		);
	});
}
