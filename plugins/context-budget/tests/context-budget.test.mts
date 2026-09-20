// What the measurement hook injects and records, exercised through the
// launcher, on the exact command `hooks.json` runs. Everything it reads is a
// file path or stdin, so there is nothing to stub. The bugs these cover live
// in the interaction between the transcript, the session record and the
// configuration rather than in any one function: a stale measurement, a level
// that never re-arms. What a case reads is the level a run announced, never
// the words it announced it in.
//
// The record a case starts from is the one an earlier run of the same session
// left, so no case writes into the hook's own state.
import assert from "node:assert/strict";
import { test } from "node:test";
import { runtimes } from "../../../tests/harness.mts";
import {
	apiError,
	assistant,
	COMPACT_SUMMARY,
	compactBoundary,
} from "./fixtures.mts";
import {
	announced,
	BROKEN,
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
	USABLE,
} from "./harness.mts";

const CONFIG = configFile(USABLE);

const prompt = (session: string, path: string) => ({
	session_id: session,
	transcript_path: path,
	hook_event_name: "UserPromptSubmit",
});

for (const runtime of runtimes()) {
	const hook = hookRunner(runtime);
	const sid = () => sessionId(runtime);
	const name = (what: string) => `${runtime}: ${what}`;
	const run = (session: string, path: string, config = CONFIG) =>
		hook("context-budget", prompt(session, path), config);

	/** The level one run announced to `session`, and null for a silent one. */
	const measured = (session: string, path: string, config = CONFIG) =>
		announced(session, run(session, path, config));

	// Claude Code names the path this hook reads, and a path it has named is
	// not always a file: a transcript moved or deleted under the session is
	// nothing to measure rather than a run to fail. Nothing is reported for it
	// either, which the config fault after it proves: a session that had
	// already been told something would hear nothing more.
	test(name("a transcript that is not there measures nothing"), () => {
		const session = sid();

		quiet(run(session, noTranscript()));
		reported(run(session, transcript(assistant(200_000)), configFile(BROKEN)));
	});

	test(name("injects once when the context first crosses notice"), () => {
		const session = sid();
		const path = transcript(assistant(200_000));

		assert.equal(measured(session, path), "notice");
		assert.equal(
			measured(session, path),
			null,
			"the same level must not inject twice",
		);
	});

	// Every rung speaks once: reaching urgent through notice, which is how a
	// session that is not compacting reaches it, has to inject at both.
	test(name("a climb through notice to urgent injects at each level"), () => {
		const session = sid();

		assert.equal(measured(session, transcript(assistant(200_000))), "notice");
		assert.equal(measured(session, transcript(assistant(260_000))), "urgent");
	});

	test(
		name(
			"a compaction resets the record instead of measuring the turn before it",
		),
		() => {
			const session = sid();

			assert.equal(measured(session, transcript(assistant(200_000))), "notice");
			assert.equal(
				measured(
					session,
					transcript(assistant(260_000), compactBoundary(), COMPACT_SUMMARY),
				),
				null,
				"the turn before the boundary is not this context",
			);
			// The record is back to nothing, so the rebuilt context announces
			// itself from `notice`.
			assert.equal(measured(session, transcript(assistant(200_000))), "notice");
		},
	);

	// Belt and braces for the same event: the record has to clear off the
	// summary entry alone, without the hook having to trust that every
	// compaction path writes a boundary entry first.
	test(name("a compaction summary alone resets the record"), () => {
		const session = sid();

		assert.equal(measured(session, transcript(assistant(200_000))), "notice");
		assert.equal(
			measured(session, transcript(assistant(260_000), COMPACT_SUMMARY)),
			null,
			"the summarized-away turn is not this context",
		);
		assert.equal(
			measured(session, transcript(assistant(200_000))),
			"notice",
			"the record is back to nothing, so notice speaks again",
		);
	});

	// Measuring one model only, the way the README documents it: `[default]`
	// switched off and a row for that model. A compaction is measured as no
	// model at all, so no row matches it and `[default]`'s null answers. It
	// still has to reset the level, or the record stays at `notice` through it
	// and the rebuilt context climbs past notice in silence.
	test(
		name("a compaction resets the level with [default] switched off"),
		() => {
			const session = sid();
			const oneModel = configFile(
				"[default]\nenabled = false\n",
				"[models.'opus']\nnotice = 150_000\nurgent = 250_000\n",
				MESSAGES,
				GUARD,
				GUARD_MESSAGES,
			);
			const onOneModel = (tokens: number) =>
				measured(session, transcript(assistant(tokens)), oneModel);

			assert.equal(onOneModel(200_000), "notice");
			assert.equal(
				measured(
					session,
					transcript(assistant(260_000), compactBoundary(), COMPACT_SUMMARY),
					oneModel,
				),
				null,
				"a compaction announces nothing, whatever governs the model",
			);
			assert.equal(
				onOneModel(200_000),
				"notice",
				"the compaction left the record at nothing, so notice speaks again",
			);
		},
	);

	test(name("urgent re-arms after the context falls back to notice"), () => {
		const session = sid();

		assert.equal(measured(session, transcript(assistant(260_000))), "urgent");
		assert.equal(
			measured(session, transcript(assistant(200_000))),
			null,
			"a fall injects nothing",
		);
		assert.equal(
			measured(session, transcript(assistant(260_000))),
			"urgent",
			"climbing past urgent again must inject again",
		);
	});

	// A request that never reached the model is written as an assistant entry
	// all the same, with every usage field zero. Read as the newest turn it
	// says the context is empty, and a session just measured at 200K crosses
	// nothing, falls back to none, and announces itself all over again.
	test(name("a failed request is not the current context"), () => {
		const session = sid();
		const path = transcript(
			assistant(200_000, { minutesAgo: 19 }),
			apiError({ minutesAgo: 5 }),
		);

		assert.equal(
			measured(session, path),
			"notice",
			"the turn above the failure is the context",
		);
	});

	// An empty model id is a transcript that says nothing about what it was
	// sent to, and no row was written for that. A row keyed to match everything
	// ('.*', '^', '') would otherwise take it and fire on thresholds nobody
	// chose for it, which on a row like this one is an urgent notice at a
	// context that is not large.
	test(
		name("a transcript that names no model takes [default], not a row"),
		() => {
			const rows = configFile(
				DEFAULTS,
				"[models.'.*']\nnotice = 10_000\nurgent = 20_000\n",
				MESSAGES,
				GUARD,
				GUARD_MESSAGES,
			);

			assert.equal(
				measured(sid(), transcript(assistant(120_000, { model: "" })), rows),
				null,
				"120K is under [default]'s 150K notice, and [default] governs it",
			);
			// The same row against an id there is one for: still tried, still
			// wins, so the rule is about the empty id and not about the row.
			assert.equal(
				measured(sid(), transcript(assistant(120_000)), rows),
				"urgent",
				"a row keyed to match everything still governs a model with an id",
			);
		},
	);
}
