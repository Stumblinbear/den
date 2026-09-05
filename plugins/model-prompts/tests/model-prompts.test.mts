// What the hook puts into a session's context, exercised through the launcher,
// which is the exact command `hooks.json` runs. Every expected text is written
// by the test that expects it.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fixtureDir, type Result, runtimes } from "../../../tests/harness.mts";
import { configFile, homeNaming, hookRunner, sessionId } from "./harness.mts";

const OPUS = "claude-opus-5";
const FABLE = "claude-fable-5-1";

const OPUS_HOME = homeNaming(OPUS);

const start = (session: string, model: string) => ({
	session_id: session,
	hook_event_name: "SessionStart",
	session_start_reason: "startup",
	model,
});

const switched = (session: string, model: string) => ({
	session_id: session,
	hook_event_name: "PostModelSwitch",
	from_model: "claude-sonnet-4-5",
	to_model: model,
});

const header = (model: string) => `Rules for the current model (${model}):`;

const shows = (result: Result, text: string) =>
	assert.ok(result.stdout.includes(text), result.stdout);

function silent(result: Result): void {
	assert.equal(result.status, 0);
	assert.equal(result.stdout, "");
	assert.equal(result.stderr, "");
}

for (const runtime of runtimes()) {
	const run = hookRunner(runtime);
	const sid = () => sessionId(runtime);
	const name = (what: string) => `${runtime}: ${what}`;

	test(name("a matching row injects; a model it misses gets nothing"), () => {
		const only = configFile("[models.'opus-5\\b']\nprompt = \"OPUS\"\n");
		const opus = run(start(sid(), OPUS), only);

		assert.equal(opus.status, 0);
		assert.equal(opus.stdout, `${header(OPUS)}\n\nOPUS\n`);
		silent(run(start(sid(), FABLE), only));
	});

	test(name("a start without a model falls back to settings.json"), () => {
		const only = configFile("[models.'opus-5\\b']\nprompt = \"OPUS\"\n");
		const bare = {
			session_id: sid(),
			hook_event_name: "SessionStart",
			session_start_reason: "startup",
		};

		shows(run(bare, only, { home: OPUS_HOME }), "OPUS");

		// No settings file at all is not a fault: the model is unknown, so
		// nothing is injected rather than everything.
		silent(run({ ...bare, session_id: sid() }, only));
	});

	test(name("a start with no model uses the one switched to earlier"), () => {
		const session = sid();
		const both = configFile(
			"[models.'opus-5\\b']\nprompt = \"OPUS\"\n\n[models.'fable']\nprompt = \"FABLE\"\n",
		);

		shows(run(switched(session, FABLE), both), "FABLE");

		// A compact rebuilds the context but does not change the model, and the
		// input for it carries none. The settings file names the model this
		// session started on, which is not the one it is on now.
		const compacted = {
			session_id: session,
			hook_event_name: "SessionStart",
			session_start_reason: "compact",
		};
		const started = run(compacted, both, { home: OPUS_HOME });

		shows(started, "FABLE");
		assert.ok(!started.stdout.includes("OPUS"), started.stdout);

		// Still remembered after the record of what was injected is cleared.
		shows(run(compacted, both, { home: OPUS_HOME }), "FABLE");
	});

	test(name("a start naming a model replaces the remembered one"), () => {
		const session = sid();
		const both = configFile(
			"[models.'opus-5\\b']\nprompt = \"OPUS\"\n\n[models.'fable']\nprompt = \"FABLE\"\n",
		);

		shows(run(switched(session, FABLE), both), "FABLE");
		shows(run(start(session, OPUS), both), "OPUS");

		// A compact carries no model and there is no settings.json to guess
		// from, so all that is left is the record, and the start above is what
		// last said what this session is on.
		const compacted = {
			session_id: session,
			hook_event_name: "SessionStart",
			session_start_reason: "compact",
		};
		const after = run(compacted, both);

		shows(after, "OPUS");
		assert.ok(!after.stdout.includes("FABLE"), after.stdout);
	});

	test(name("`every` injects on each switch into a matching model"), () => {
		const session = sid();
		const always = configFile(
			'[models.\'opus-5\\b\']\non_switch = "every"\nprompt = "EVERY"\n',
		);

		shows(run(switched(session, OPUS), always), "EVERY");
		shows(run(switched(session, OPUS), always), "EVERY");
	});

	test(name("`once` injects once; a session start re-arms it"), () => {
		const session = sid();
		const only = configFile(
			'[models.\'opus-5\\b\']\non_switch = "once"\nprompt = "ONCE"\n',
		);

		shows(run(switched(session, OPUS), only), "ONCE");
		silent(run(switched(session, OPUS), only));

		// The start injects since `on_start` is on by default, and the switch
		// after it is quiet again, because the text is in the context. That the
		// start also cleared the record is proved by the case below, not here.
		shows(run(start(session, OPUS), only), "ONCE");
		silent(run(switched(session, OPUS), only));
	});

	test(name("a start re-arms `once` for a row that is silent on it"), () => {
		const session = sid();
		const onSwitch = configFile(
			'[models.\'opus-5\\b\']\non_start = false\non_switch = "once"\nprompt = "ONCE"\n',
		);

		shows(run(switched(session, OPUS), onSwitch), "ONCE");
		silent(run(switched(session, OPUS), onSwitch));

		// The start injects nothing of its own here, so what re-arms the row is
		// the context the start rebuilt and nothing else: `once` means the text
		// is in this context, and this is a new one.
		silent(run(start(session, OPUS), onSwitch));
		shows(run(switched(session, OPUS), onSwitch), "ONCE");
	});

	test(name("`never` and `on_start = false` block opposite events"), () => {
		const never = configFile(
			'[models.\'opus-5\\b\']\non_switch = "never"\nprompt = "NEVER"\n',
		);
		const noStart = configFile(
			'[models.\'opus-5\\b\']\non_start = false\non_switch = "every"\nprompt = "SWITCH"\n',
		);

		shows(run(start(sid(), OPUS), never), "NEVER");
		silent(run(switched(sid(), OPUS), never));

		silent(run(start(sid(), OPUS), noStart));
		shows(run(switched(sid(), OPUS), noStart), "SWITCH");
	});

	test(name("a row's `file` resolves beside the config file"), () => {
		const dir = fixtureDir("file-row");

		writeFileSync(join(dir, "rule.md"), "FROM A FILE\n");

		const path = join(dir, "config.toml");

		writeFileSync(path, "[models.'opus-5\\b']\nfile = \"rule.md\"\n");
		shows(run(start(sid(), OPUS), path), "FROM A FILE");
	});

	test(name("matching rows inject in the order they are written"), () => {
		const generalFirst = configFile(
			"[models.'.']\nprompt = \"GENERAL\"\n\n[models.'opus-5\\b']\nprompt = \"SPECIFIC\"\n",
		);
		const specificFirst = configFile(
			"[models.'opus-5\\b']\nprompt = \"SPECIFIC\"\n\n[models.'.']\nprompt = \"GENERAL\"\n",
		);

		assert.equal(
			run(start(sid(), OPUS), generalFirst).stdout,
			`${header(OPUS)}\n\nGENERAL\n\nSPECIFIC\n`,
		);
		assert.equal(
			run(start(sid(), OPUS), specificFirst).stdout,
			`${header(OPUS)}\n\nSPECIFIC\n\nGENERAL\n`,
		);

		// A model no other row matches gets the general text on its own.
		assert.equal(
			run(start(sid(), "claude-sonnet-4-5"), generalFirst).stdout,
			`${header("claude-sonnet-4-5")}\n\nGENERAL\n`,
		);
	});

	test(name("`once` and `every` are per row"), () => {
		const session = sid();
		const mixed = configFile(
			'[models.\'.\']\nprompt = "GENERAL"\non_switch = "once"\n\n[models.\'opus-5\\b\']\nprompt = "OPUS"\non_switch = "every"\n',
		);
		const first = run(switched(session, OPUS), mixed);

		shows(first, "GENERAL");
		shows(first, "OPUS");

		const second = run(switched(session, OPUS), mixed);

		assert.ok(!second.stdout.includes("GENERAL"), second.stdout);
		shows(second, "OPUS");
	});

	test(name("`enabled = false` silences a row on both events"), () => {
		const off = configFile(
			"[models.'opus-5\\b']\nenabled = false\nprompt = \"OFF\"\n",
		);

		silent(run(start(sid(), OPUS), off));
		silent(run(switched(sid(), OPUS), off));
	});

	test(name("a subagent's input is ignored"), () => {
		const only = configFile("[models.'opus-5\\b']\nprompt = \"OPUS\"\n");

		silent(run({ ...start(sid(), OPUS), agent_id: "some-subagent" }, only));
	});
}
