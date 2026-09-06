// The failure policy every entry shares: no stand-in values, and no fault the
// session is not told about. A parser that will not import, or a configuration
// that cannot be read, parsed, or used, is reported by whichever entry meets
// it. What is simply not there is no failure at all: a configuration that is
// not there is a plugin nobody has configured yet, and text on stdin that no
// hook can read as input is nothing to act on. How long a fault goes on being
// reported is `report-runs.test.mts`.
//
// What each report says is off follows the same split: the file and the parser
// stop every entry and the line names all three, while an entry's own run
// coming apart stops that entry and the line names only it.
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
	unreadableSession,
	unreadableTranscript,
	withoutParser,
} from "./harness.mts";
import { INVALID } from "./invalid-configs.mts";
import { watcherRuns } from "./watcher-runs.mts";

/** What a fault of the shared file or the shared parser costs the session. */
const EVERY_ENTRY =
	"The context notice, the watcher and the resume guard are off for this session";

/** A file every entry can use, so what a case meets is not the configuration. */
const CONFIG = configFile(USABLE);

// The parser report has to name the package the user has to reinstall.
const NAMES_THE_PACKAGE = /smol-toml/;

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

	const measure = (session: string, config: string, options?: RunOptions) =>
		measureOn(session, transcript(assistant(200_000)), config, options);

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

	test(name("a parser that will not import is a parser fault"), () => {
		const launcher = withoutParser();
		const path = configFile(USABLE);

		assert.match(
			reported(guard(sid(), path, { launcher }), "parser"),
			NAMES_THE_PACKAGE,
		);
	});

	// A directory where the session's transcript belongs: the read fails on
	// something that is not the file's absence, which nothing here has a fault
	// of its own for, so it stops the run as a plain error. The entry runner is
	// what turns that into one report on the run that met it.
	test(
		name("a run stopped by an error of its own is an internal fault"),
		() => {
			const session = sid();
			const path = configFile(USABLE);

			reported(
				guardOn(session, unreadableSession("big", [assistant(162_300)]), path),
				"internal",
			);
		},
	);

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

	test(name("a malformed config is reported, naming the file"), () => {
		const session = sid();
		const path = configFile(BROKEN);
		const line = reported(guard(session, path), "config");

		assert.ok(line.includes(path), line);
		assert.ok(line.includes(EVERY_ENTRY), line);
	});

	// The report asks whoever reads it to put the line to the user, and a
	// subagent answers its coordinator. The coordinator's own runs read the same
	// file through the same parser, so the line reaches the user from there.
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

	// An internal error stops the entry that met it and nothing else, so its
	// line names that entry alone. All three below are forced the same way, by
	// a transcript path none of them can read, so what differs between the
	// lines is only which entry met it.
	test(name("an internal error in the notice entry names the notice"), () => {
		const line = reported(
			measureOn(sid(), unreadableTranscript(), CONFIG),
			"internal",
		);

		assert.ok(
			line.includes("The context notice is off for this session"),
			line,
		);
	});

	test(name("an internal error in the guard entry names the guard"), () => {
		const line = reported(
			guardOn(sid(), unreadableTranscript(), CONFIG),
			"internal",
		);

		assert.ok(line.includes("The resume guard is off for this session"), line);
	});

	test(name("an internal error in the watcher entry names the watcher"), () => {
		const { session, stop } = watcherRuns(runtime);
		const line = reported(stop(session(), unreadableTranscript()), "internal");

		assert.ok(line.includes("The watcher is off for this session"), line);
	});

	for (const [what, names, sections] of INVALID) {
		test(name(`a config with ${what} is a config fault`), () => {
			const session = sid();
			const path = configFile(...sections);
			const line = reported(measure(session, path), "config");

			assert.ok(line.includes(path), line);
			assert.ok(line.includes(names), line);
		});
	}

	// Both entries read one file through one parser, and a report is a fact
	// about the run making it rather than about the session: a fault one entry
	// has already met is one the next entry to meet it reports too.
	test(name("each entry reports the broken file it meets"), () => {
		const session = sid();
		const path = configFile(BROKEN);

		reported(guard(session, path), "config");
		reported(measure(session, path), "config");
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

		reported(measure(session, path), "config");
		writeFileSync(path, USABLE);

		const result = measure(session, path);

		assert.equal(result.status, 0);
		assert.equal(result.stderr, "");
		assert.ok(result.stdout.includes("NOTICE"), result.stdout);
	});
}
