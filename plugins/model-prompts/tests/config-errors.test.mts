// The failure policy: no stand-in values, and no fault the session is not told
// about. A parser that will not import, or a configuration that cannot be
// parsed or used, is reported by every run that meets it, on the field Claude
// Code hands the agent. Every run reads the file, so a fix takes effect on the
// next one and the reports stop with it. A configuration that is simply not
// there is no failure: it is a plugin nobody has configured yet.
//
// These run the real process through the launcher, because the whole contract
// is out of band: what a run writes on stdout for the agent, and the exit of a
// hook that has not failed.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fixtureDir, runtimes } from "../../../tests/harness.mts";
import {
	addressedTo,
	BROKEN,
	configFile,
	homeNaming,
	hookRunner,
	injected,
	quiet,
	type RunOptions,
	reported,
	sessionId,
	USABLE,
	withoutParser,
} from "./harness.mts";

// A home naming the model the session below switches away from, for the run
// there that carries no model id of its own.
const OPUS_HOME = homeNaming("claude-opus-5");

const input = (session: string, event = "SessionStart") => ({
	session_id: session,
	hook_event_name: event,
	source: "startup",
	model: "claude-opus-5",
	to_model: "claude-opus-5",
});

// One row per fault the checker is responsible for, each phrased the way an
// author would write the mistake.
const INVALID: ReadonlyArray<readonly [string, string]> = [
	["models that is not a table", "models = 5\n"],
	["a row that is not a table", "[models]\nopus = 5\n"],
	["a key that is not a regular expression", "[models.'(']\nprompt = \"x\"\n"],
	["enabled that is not a boolean", "[models.'.']\nenabled = \"yes\"\n"],
	[
		"on_start that is not a boolean",
		"[models.'.']\non_start = 1\nprompt = \"x\"\n",
	],
	[
		"on_switch that is not one of the three",
		'[models.\'.\']\non_switch = "sometimes"\nprompt = "x"\n',
	],
	// A row parked for later is still checked, so the mistake surfaces while it
	// is being written rather than the day it is switched back on.
	[
		"on_switch that is not one of the three in a disabled row",
		"[models.'.']\nenabled = false\non_switch = \"sometimes\"\n",
	],
	["both prompt and file", '[models.\'.\']\nprompt = "x"\nfile = "rule.md"\n'],
	["neither prompt nor file", "[models.'.']\non_start = true\n"],
	["a blank prompt", "[models.'.']\nprompt = \"   \"\n"],
];

for (const runtime of runtimes()) {
	const hook = hookRunner(runtime);
	const sid = () => sessionId(runtime);
	const name = (what: string) => `${runtime}: ${what}`;
	const run = (session: string, config: string, options?: RunOptions) =>
		hook(input(session), config, options);

	test(name("a config file that is not there is not a fault"), () => {
		quiet(run(sid(), join(fixtureDir("no-config"), "never-written.toml")));
	});

	test(name("a parser that will not import is reported"), () => {
		const launcher = withoutParser();

		reported(run(sid(), configFile(""), { launcher }));
	});

	for (const [what, contents] of INVALID) {
		test(name(`a row with ${what} is reported`), () => {
			reported(run(sid(), configFile(contents)));
		});
	}

	test(name("an unreadable `file` is reported"), () => {
		const path = join(fixtureDir("missing-file"), "config.toml");

		writeFileSync(path, "[models.'.']\nfile = \"nowhere.md\"\n");
		reported(run(sid(), path));
	});

	// Nothing is written down between runs, so what the session hears is what
	// each run met: this plugin is on the start of a session and on a model
	// switch, and neither fires twice inside one turn.
	test(name("a standing fault is reported by every run that meets it"), () => {
		const session = sid();
		const path = configFile(BROKEN);

		reported(run(session, path));
		reported(hook(input(session, "PostModelSwitch"), path));
	});

	// The report travels in `hookSpecificOutput`, which Claude Code reads
	// against the event the run was called for: a report addressed to any
	// other event is one it drops.
	test(name("a report is addressed to the event that ran"), () => {
		const session = sid();
		const path = configFile(BROKEN);

		assert.equal(addressedTo(run(session, path)), "SessionStart");
		assert.equal(
			addressedTo(hook(input(session, "PostModelSwitch"), path)),
			"PostModelSwitch",
		);
	});

	// A fault the user has put right is one the session stops hearing about on
	// the very next run, and one they break again is one it hears about afresh.
	test(name("the reports stop when the fault does, and start again"), () => {
		const session = sid();
		const path = configFile(BROKEN);

		reported(run(session, path));
		writeFileSync(path, USABLE);

		// The run injects its row rather than a report, so the fault is over.
		injected(hook(input(session, "PostModelSwitch"), path));

		writeFileSync(path, BROKEN);
		reported(hook(input(session, "PostModelSwitch"), path));
	});

	// Which model a session is on is a fact about the session, not about the
	// configuration: a run that can inject nothing still records the switch, or
	// a later run carrying no model id has nothing left to answer with.
	test(name("a switch made while the config is broken is remembered"), () => {
		const session = sid();
		const path = configFile(BROKEN);

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
		);
		writeFileSync(path, "[models.'fable']\nprompt = \"FABLE\"\n");

		// A compact carries no model id, so the record answers. The home names
		// the model this session left, which the one row does not match.
		injected(
			hook(
				{
					session_id: session,
					hook_event_name: "SessionStart",
					source: "compact",
				},
				path,
				{ home: OPUS_HOME },
			),
		);
	});
}
