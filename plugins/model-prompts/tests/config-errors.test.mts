// The failure policy: no quiet recovery, and no stand-in values. A parser that
// will not import, or a configuration that cannot be parsed or used, is
// reported once, and the rest of the session hears nothing more about it --
// though every run still reads the file, so a fix takes effect on the next
// one. A configuration that is simply not there is no failure: it is a plugin
// nobody has configured yet.
//
// These run the real process through the launcher, because the whole contract
// is out of band: an exit code, one line on stderr, and a marker file.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fixtureDir, runtimes } from "../../../tests/harness.mts";
import {
	configFile,
	homeNaming,
	hookRunner,
	quiet,
	type RunOptions,
	reported,
	sessionId,
	withoutParser,
} from "./harness.mts";

// The parser report has to name the package the user has to reinstall.
const NAMES_THE_PACKAGE = /smol-toml/;

// The model this session did not switch to, for the run that has nothing but
// the record and this file to go on.
const OPUS_HOME = homeNaming("claude-opus-5");

const input = (session: string, event = "SessionStart") => ({
	session_id: session,
	hook_event_name: event,
	session_start_reason: "startup",
	model: "claude-opus-5",
	to_model: "claude-opus-5",
});

// One row per fault the checker is responsible for, each phrased the way an
// author would write the mistake, and what the report has to name for that
// author to find it: the row, and the key too wherever one key is wrong.
const INVALID: ReadonlyArray<readonly [string, string, string]> = [
	["models that is not a table", "[models]", "models = 5\n"],
	["a row that is not a table", "[models.'opus']", "[models]\nopus = 5\n"],
	[
		"a key that is not a regular expression",
		"[models.'(']",
		"[models.'(']\nprompt = \"x\"\n",
	],
	[
		"enabled that is not a boolean",
		"[models.'.'] enabled",
		"[models.'.']\nenabled = \"yes\"\n",
	],
	[
		"on_start that is not a boolean",
		"[models.'.'] on_start",
		"[models.'.']\non_start = 1\nprompt = \"x\"\n",
	],
	[
		"on_switch that is not one of the three",
		"[models.'.'] on_switch",
		'[models.\'.\']\non_switch = "sometimes"\nprompt = "x"\n',
	],
	// A row parked for later is still checked, so the mistake surfaces while it
	// is being written rather than the day it is switched back on.
	[
		"on_switch that is not one of the three in a disabled row",
		"[models.'.'] on_switch",
		"[models.'.']\nenabled = false\non_switch = \"sometimes\"\n",
	],
	[
		"both prompt and file",
		"[models.'.'] with both prompt and file",
		'[models.\'.\']\nprompt = "x"\nfile = "rule.md"\n',
	],
	[
		"neither prompt nor file",
		"[models.'.'] with neither prompt nor file",
		"[models.'.']\non_start = true\n",
	],
	["a blank prompt", "[models.'.'] prompt", "[models.'.']\nprompt = \"   \"\n"],
];

for (const runtime of runtimes()) {
	const hook = hookRunner(runtime);
	const sid = () => sessionId(runtime);
	const name = (what: string) => `${runtime}: ${what}`;
	const run = (session: string, config: string, options?: RunOptions) =>
		hook(input(session), config, options);

	test(name("a config file that is not there is not a fault"), () => {
		const session = sid();

		quiet(run(session, join(fixtureDir("no-config"), "never-written.toml")));

		// Nothing was reported, so a real fault after it is still the first this
		// session hears about.
		reported(
			run(session, configFile("[models.'opus'\nprompt = \"x\"\n")),
			"config",
		);
	});

	test(name("a missing parser is reported once, then it goes quiet"), () => {
		const launcher = withoutParser();
		const session = sid();
		const path = configFile("");

		assert.match(
			reported(run(session, path, { launcher }), "parser"),
			NAMES_THE_PACKAGE,
		);
		quiet(run(session, path, { launcher }));
	});

	test(name("a malformed config is reported once, naming the file"), () => {
		const session = sid();
		const path = configFile("[models.'opus'\nprompt = \"x\"\n");
		const line = reported(run(session, path), "config");

		assert.ok(line.includes(path), line);
		quiet(run(session, path));
	});

	for (const [what, names, contents] of INVALID) {
		test(name(`a row with ${what} is a config fault`), () => {
			const session = sid();
			const path = configFile(contents);
			const line = reported(run(session, path), "config");

			assert.ok(line.includes(path), line);
			assert.ok(line.includes(names), line);
			quiet(run(session, path));
		});
	}

	test(name("an unreadable `file` is reported with its resolved path"), () => {
		const dir = fixtureDir("missing-file");
		const path = join(dir, "config.toml");

		writeFileSync(path, "[models.'.']\nfile = \"nowhere.md\"\n");

		const line = reported(run(sid(), path), "config");

		assert.ok(line.includes(join(dir, "nowhere.md")), line);
	});

	test(name("a fault at session start silences the switch after it"), () => {
		const session = sid();
		const path = configFile("[models.'opus'\nprompt = \"x\"\n");

		reported(run(session, path), "config");
		quiet(hook(input(session, "PostModelSwitch"), path));
	});

	test(name("a fixed config injects on the very next run"), () => {
		const session = sid();
		const path = configFile("[models.'opus'\nprompt = \"x\"\n");

		reported(run(session, path), "config");
		writeFileSync(path, "[models.'opus-5\\b']\nprompt = \"FIXED\"\n");

		const result = hook(input(session, "PostModelSwitch"), path);

		assert.equal(result.status, 0);
		assert.equal(result.stderr, "");
		assert.ok(result.stdout.includes("FIXED"), result.stdout);
	});

	// Which model a session is on is a fact about the session, not about the
	// configuration: a run that can inject nothing still has to record it, or
	// the switch is lost and a later run falls back to a stale guess.
	test(name("a switch made while the config is broken is remembered"), () => {
		const session = sid();
		const path = configFile("[models.'opus'\nprompt = \"x\"\n");

		reported(
			hook(
				{
					session_id: session,
					hook_event_name: "PostModelSwitch",
					from_model: "claude-opus-5",
					to_model: "claude-fable-5-1",
				},
				path,
			),
			"config",
		);
		writeFileSync(
			path,
			"[models.'opus-5\\b']\nprompt = \"OPUS\"\n\n[models.'fable']\nprompt = \"FABLE\"\n",
		);

		// A compact carries no model, so all the run has is the record and the
		// settings file -- which names the model the session started on.
		const compacted = hook(
			{
				session_id: session,
				hook_event_name: "SessionStart",
				session_start_reason: "compact",
			},
			path,
			{ home: OPUS_HOME },
		);

		assert.ok(compacted.stdout.includes("FABLE"), compacted.stdout);
		assert.ok(!compacted.stdout.includes("OPUS"), compacted.stdout);
	});

	// A run with nothing to report must leave the session able to hear about
	// the next thing that does go wrong.
	test(name("a usable config silences nothing"), () => {
		const session = sid();
		const result = run(
			session,
			configFile("[models.'opus-5\\b']\nprompt = \"FINE\"\n"),
		);

		assert.equal(result.status, 0);
		assert.equal(result.stderr, "");
		assert.ok(result.stdout.includes("FINE"), result.stdout);
		reported(
			run(session, configFile("[models.'opus'\nprompt = \"x\"\n")),
			"config",
		);
	});
}
