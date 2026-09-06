// The failure policy both hooks share: no stand-in values, and no fault the
// session is not told about. A parser that will not import, or a configuration
// that cannot be read, parsed, or used, is reported by whichever hook hits it
// first, and the runs after it do nothing at all, silently. How long that
// silence lasts is `standing-faults.test.mts`, and how the session hears that
// the fault is over is `fault-recovery.test.mts`. What is simply not there is
// no failure at all: a configuration that is not there is a plugin nobody has
// configured yet, and text on stdin that no hook can read as input is nothing
// to act on.
//
// These run the real processes through the launcher, because the whole
// contract is out of band: an exit code and one line on stderr. Where the
// class already said is written down is `session-record.test.mts`.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { test } from "node:test";
import { runtimes } from "../../../tests/harness.mts";
import { assistant } from "./fixtures.mts";
import {
	configFile,
	DEFAULTS,
	GUARD,
	GUARD_MESSAGES,
	holdLock,
	hookRunner,
	MESSAGES,
	noConfig,
	quiet,
	type RunOptions,
	reported,
	sessionId,
	subagentSession,
	transcript,
	unreadableSession,
	withoutParser,
} from "./harness.mts";

// The parser report has to name the package the user has to reinstall.
const NAMES_THE_PACKAGE = /smol-toml/;

// One row per fault the checker is responsible for, each phrased the way an
// author would write the mistake, and what the report has to name for that
// author to find it: the section, and the key too wherever one key is wrong.
// Nothing is merged under the file, so a section or a key the file leaves out
// is one of them.
const INVALID: ReadonlyArray<readonly [string, string, readonly string[]]> = [
	["no [default] at all", "[default]", [MESSAGES, GUARD, GUARD_MESSAGES]],
	[
		"a [default] with no urgent",
		"[default] urgent",
		["[default]\nnotice = 1\n", MESSAGES, GUARD, GUARD_MESSAGES],
	],
	[
		"a [default] notice that is not a number",
		"[default] notice",
		[
			'[default]\nnotice = "lots"\nurgent = 2\n',
			MESSAGES,
			GUARD,
			GUARD_MESSAGES,
		],
	],
	["no [messages] at all", "[messages]", [DEFAULTS, GUARD, GUARD_MESSAGES]],
	[
		"a [messages] with a blank notice",
		"[messages] notice",
		[
			DEFAULTS,
			'[messages]\nnotice = ""\nurgent = "u"\n',
			GUARD,
			GUARD_MESSAGES,
		],
	],
	["no [resume-guard] at all", "[resume-guard]", [DEFAULTS, MESSAGES]],
	[
		"a [resume-guard] with no cold",
		"[resume-guard] cold",
		[DEFAULTS, MESSAGES, "[resume-guard]\nlarge = 1\n", GUARD_MESSAGES],
	],
	[
		"a [resume-guard.messages] with a blank denied",
		"[resume-guard.messages] denied",
		[
			DEFAULTS,
			MESSAGES,
			GUARD,
			'[resume-guard.messages]\ndenied = ""\nused = "u"\n',
		],
	],
	[
		"a models row that is not a table",
		"[models.'opus']",
		[DEFAULTS, "[models]\nopus = 5\n", MESSAGES, GUARD, GUARD_MESSAGES],
	],
	[
		"a models key that is not a regular expression",
		"[models.'(']",
		[
			DEFAULTS,
			"[models.'(']\nnotice = 1\nurgent = 2\n",
			MESSAGES,
			GUARD,
			GUARD_MESSAGES,
		],
	],
	[
		"a models row enabled that is not a boolean",
		"[models.'.'] enabled",
		[
			DEFAULTS,
			"[models.'.']\nenabled = \"yes\"\n",
			MESSAGES,
			GUARD,
			GUARD_MESSAGES,
		],
	],
];

for (const runtime of runtimes()) {
	const hook = hookRunner(runtime);
	const sid = () => sessionId(runtime);
	const name = (what: string) => `${runtime}: ${what}`;

	const measure = (session: string, config: string, options?: RunOptions) =>
		hook(
			"context-budget",
			{
				hook_event_name: "UserPromptSubmit",
				session_id: session,
				transcript_path: transcript(assistant(200_000)),
			},
			config,
			options,
		);

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

		// Nothing was reported, so a real fault after it is still the first
		// this session hears about.
		reported(
			measure(session, configFile("[resume-guard\nlarge = 10\n")),
			"config",
		);
	});

	test(name("a missing parser is reported once, then it goes quiet"), () => {
		const launcher = withoutParser();
		const session = sid();
		const path = configFile(DEFAULTS, MESSAGES, GUARD, GUARD_MESSAGES);

		assert.match(
			reported(guard(session, path, { launcher }), "parser"),
			NAMES_THE_PACKAGE,
		);
		quiet(guard(session, path, { launcher }));
	});

	// A directory where the session's transcript belongs: the read fails on
	// something that is not the file's absence, which nothing here has a fault
	// of its own for, so it stops the run as a plain error. The entry runner is
	// what turns that into one report and then silence, rather than a failed
	// hook on every tool call after it.
	test(name("a run stopped by an error of its own is reported once"), () => {
		const session = sid();
		const path = configFile(DEFAULTS, MESSAGES, GUARD, GUARD_MESSAGES);
		const crash = () =>
			guardOn(session, unreadableSession("big", [assistant(162_300)]), path);

		reported(crash(), "internal");
		quiet(crash());
	});

	// What a hook is handed on stdin is whatever started it. Text it cannot
	// read as input leaves it with nothing to do, which is not the same as
	// something to report.
	test(name("stdin that is not JSON leaves both hooks silent"), () => {
		const session = sid();
		const path = configFile(DEFAULTS, MESSAGES, GUARD, GUARD_MESSAGES);
		const notJson: RunOptions = { stdin: "not json at all" };

		quiet(measure(session, path, notJson));
		quiet(guard(session, path, notJson));

		reported(
			measure(session, configFile("[resume-guard\nlarge = 10\n")),
			"config",
		);
	});

	test(name("a malformed config is reported once, naming the file"), () => {
		const session = sid();
		const path = configFile("[resume-guard\nlarge = 10\n");
		const line = reported(guard(session, path), "config");

		assert.ok(line.includes(path), line);
		quiet(guard(session, path));
	});

	for (const [what, names, sections] of INVALID) {
		test(name(`a config with ${what} is a config fault`), () => {
			const session = sid();
			const path = configFile(...sections);
			const line = reported(measure(session, path), "config");

			assert.ok(line.includes(path), line);
			assert.ok(line.includes(names), line);
			quiet(measure(session, path));
		});
	}

	// The two hooks report through one record, so a session hears about a
	// broken file once however many hooks meet it.
	test(
		name("a fault reported by the guard silences the measurement hook"),
		() => {
			const session = sid();
			const path = configFile("[resume-guard\nlarge = 10\n");

			reported(guard(session, path), "config");
			quiet(measure(session, path));
		},
	);

	// Which classes the session has been told about is in the record, and the
	// record is only read under its own lock. A run that cannot take that lock
	// is handed no answer, and says the line again rather than swallow one
	// nobody may have heard: the lock costs the silence, not the report.
	test(name("a fault met under a held lock is reported again"), () => {
		const session = sid();
		const path = configFile("[resume-guard\nlarge = 10\n");

		reported(measure(session, path), "config");
		quiet(measure(session, path));

		holdLock(session);
		reported(measure(session, path), "config");
	});

	test(name("a fixed config takes effect on the very next run"), () => {
		const session = sid();
		const path = configFile("[resume-guard\nlarge = 10\n");

		reported(measure(session, path), "config");
		writeFileSync(path, [DEFAULTS, MESSAGES, GUARD, GUARD_MESSAGES].join("\n"));

		const result = measure(session, path);

		assert.equal(result.status, 0);
		assert.equal(result.stderr, "");
		assert.ok(result.stdout.includes("NOTICE"), result.stdout);
	});
}
