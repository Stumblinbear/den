// What the unattended switch quiets, exercised through the launcher on the
// exact commands `hooks.json` runs: the context notice and the watcher, while
// the switch file exists, and nothing once it is gone. A case puts the switch
// where the README tells the plugin that writes it to, and asserts on the
// record and the judge's calls, never on a message's wording.
import assert from "node:assert/strict";
import { test } from "node:test";
import { runtimes } from "../../../tests/harness.mts";
import { assistant, COMPACT_SUMMARY, compactBoundary } from "./fixtures.mts";
import {
	announced,
	configFile,
	hookRunner,
	quiet,
	removeUnattended,
	sessionId,
	transcript,
	USABLE,
	writeUnattended,
} from "./harness.mts";
import { conversation, LATER, NOTICE, watcherRuns } from "./watcher-runs.mts";

const CONFIG = configFile(USABLE);

for (const runtime of runtimes()) {
	const hook = hookRunner(runtime);
	const sid = () => sessionId(runtime);
	const name = (what: string) => `${runtime}: ${what}`;

	/** The level one prompt run announced to `session`, and null for none. */
	const measured = (session: string, path: string) =>
		announced(
			session,
			hook(
				"context-budget",
				{
					session_id: session,
					transcript_path: path,
					hook_event_name: "UserPromptSubmit",
				},
				CONFIG,
			),
		);

	// A rise the session was not told about is not recorded as told, so the
	// first run after the switch is gone announces where the context stands.
	test(name("the switch silences every level until it is removed"), () => {
		const session = sid();

		writeUnattended(session);
		assert.equal(measured(session, transcript(assistant(200_000))), null);
		assert.equal(measured(session, transcript(assistant(260_000))), null);

		removeUnattended(session);
		assert.equal(
			measured(session, transcript(assistant(260_000))),
			"urgent",
			"the level reached under the switch was never told",
		);
	});

	// Auto-compaction is what keeps an unattended session going, so a fall
	// under the switch still re-arms the levels the session heard before it.
	test(name("a compaction under the switch still resets the level"), () => {
		const session = sid();

		assert.equal(measured(session, transcript(assistant(200_000))), "notice");

		writeUnattended(session);
		assert.equal(
			measured(
				session,
				transcript(assistant(200_000), compactBoundary(), COMPACT_SUMMARY),
			),
			null,
		);
		assert.equal(measured(session, transcript(assistant(200_000))), null);

		removeUnattended(session);
		assert.equal(
			measured(session, transcript(assistant(200_000))),
			"notice",
			"the compaction re-armed notice, which the switch kept quiet",
		);
	});

	test(name("the watcher consults no judge under the switch"), () => {
		const { judge, session, stop } = watcherRuns(runtime);
		const id = session();

		judge.answers(LATER);
		writeUnattended(id);
		quiet(stop(id, conversation(NOTICE)));
		assert.equal(judge.prompts().length, 0);

		removeUnattended(id);
		quiet(stop(id, conversation(NOTICE, {}, 3)));
		assert.equal(judge.prompts().length, 1);
	});
}
