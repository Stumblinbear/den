// The failure policy every entry shares: no stand-in values, and no fault the
// session is not told about. A parser that will not import, or a configuration
// that cannot be read, parsed, or used, is reported by whichever entry meets
// it. What is simply not there is no failure at all: a configuration that is
// not there is a plugin nobody has configured yet, and text on stdin that no
// hook can read as input is nothing to act on. How long a fault goes on being
// reported is `report-runs.test.mts`.
//
// These run the real processes through the launcher, because the whole
// contract is out of band: what a run writes on stdout for the agent, and the
// exit of a hook that has not failed.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { test } from "node:test";
import { runtimes } from "../../../tests/harness.mts";
import { assistant } from "./fixtures.mts";
import {
	addressedTo,
	BROKEN,
	configFile,
	hookRunner,
	noConfig,
	quiet,
	type RunOptions,
	reported,
	sessionId,
	subagentSession,
	transcript,
	USABLE,
	unreadableTranscript,
	withoutParser,
} from "./harness.mts";
import { INVALID } from "./invalid-configs.mts";
import { wakeRuns } from "./wake-runs.mts";
import { watcherRuns } from "./watcher-runs.mts";

/** A file every entry can use, so what a case meets is not the configuration. */
const CONFIG = configFile(USABLE);

for (const runtime of runtimes()) {
	const hook = hookRunner(runtime);
	const sid = () => sessionId(runtime);
	const name = (what: string) => `${runtime}: ${what}`;

	const measureOn = (
		session: string,
		path: string,
		config: string,
		options?: RunOptions,
	) =>
		hook(
			"context-budget",
			{
				hook_event_name: "UserPromptSubmit",
				session_id: session,
				transcript_path: path,
			},
			config,
			options,
		);

	// Under every threshold the files here set, so a report is the whole of
	// what a run writes and silence means the run found no fault.
	const quietly = transcript(assistant(50_000));

	const measure = (session: string, config: string, options?: RunOptions) =>
		measureOn(session, quietly, config, options);

	const guardOn = (
		session: string,
		path: string,
		config: string,
		options?: RunOptions,
	) =>
		hook(
			"resume-guard",
			{
				hook_event_name: "PreToolUse",
				tool_name: "SendMessage",
				session_id: session,
				tool_input: { to: "big" },
				transcript_path: path,
			},
			config,
			options,
		);

	const guard = (session: string, config: string, options?: RunOptions) =>
		guardOn(
			session,
			subagentSession("big", [assistant(162_300)], ["{}"]),
			config,
			options,
		);

	test(name("a config file that is not there leaves both hooks silent"), () => {
		const session = sid();
		const path = noConfig();

		quiet(measure(session, path));
		quiet(guard(session, path));
	});

	test(name("a parser that will not import is reported"), () => {
		const launcher = withoutParser();
		const path = configFile(USABLE);

		reported(guard(sid(), path, { launcher }));
	});

	// What a hook is handed on stdin is whatever started it. Text it cannot
	// read as input leaves it with nothing to do, which is not the same as
	// something to report.
	test(name("stdin that is not JSON leaves both hooks silent"), () => {
		const session = sid();
		const path = configFile(USABLE);
		const notJson: RunOptions = { stdin: "not json at all" };

		quiet(measure(session, path, notJson));
		quiet(guard(session, path, notJson));
	});

	// The report asks whoever reads it to put the line to the user, and a
	// subagent answers the session that launched it. The session's own runs
	// read the same file through the same parser, so the line reaches the user
	// from there.
	test(name("a subagent's own tool call hears nothing"), () => {
		quiet(
			hook(
				"resume-guard",
				{
					hook_event_name: "PreToolUse",
					tool_name: "SendMessage",
					session_id: sid(),
					agent_id: "some-subagent",
					tool_input: { to: "big" },
					transcript_path: subagentSession("big", [assistant(162_300)], ["{}"]),
				},
				configFile(BROKEN),
			),
		);
	});

	// A run stopped by an error of its own, which nothing here has a fault for,
	// is reported by the entry runner on the run that met it.
	test(name("an internal error in the notice entry is reported"), () => {
		reported(measureOn(sid(), unreadableTranscript(), CONFIG));
	});

	test(name("an internal error in the guard entry is reported"), () => {
		reported(guardOn(sid(), unreadableTranscript(), CONFIG));
	});

	test(name("an internal error in the watcher entry is reported"), () => {
		const { session, stop } = watcherRuns(runtime);

		reported(stop(session(), unreadableTranscript()));
	});

	// The wake waits rather than answering, so it reports only what its first
	// check meets: past that there is no turn left for a line to land on, and
	// an unreadable transcript is what stops it in that first check.
	test(name("an internal error in the wake entry is reported"), async () => {
		const runs = await wakeRuns(runtime);

		try {
			reported(runs.stop(runs.session(), unreadableTranscript()));
		} finally {
			await runs.close();
		}
	});

	// Through the guard, whose healthy run writes a permission decision and no
	// report. The notice writes its own line into the field a report travels in,
	// so a row setting a threshold the fixture crosses reads as reported there
	// whether the file was refused or not.
	for (const [what, sections] of INVALID) {
		test(name(`a config with ${what} is reported`), () => {
			reported(guard(sid(), configFile(...sections)));
		});
	}

	// Both entries read one file through one parser, and a report is a fact
	// about the run making it rather than about the session: a fault one entry
	// has already met is one the next entry to meet it reports too.
	test(name("each entry reports the broken file it meets"), () => {
		const session = sid();
		const path = configFile(BROKEN);

		reported(guard(session, path));
		reported(measure(session, path));
	});

	// The report travels in `hookSpecificOutput`, which Claude Code reads
	// against the event the run was called for: a report addressed to any
	// other event is one it drops.
	test(name("a report is addressed to the event that ran"), () => {
		const session = sid();
		const path = configFile(BROKEN);

		assert.equal(addressedTo(measure(session, path)), "UserPromptSubmit");
		assert.equal(addressedTo(guard(session, path)), "PreToolUse");
	});

	test(name("a fixed config takes effect on the very next run"), () => {
		const session = sid();
		const path = configFile(BROKEN);

		reported(measure(session, path));
		writeFileSync(path, USABLE);
		quiet(measure(session, path));
	});
}
