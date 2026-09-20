// When the hook puts rows into a session's context, exercised through the
// launcher, which is the exact command `hooks.json` runs. A case reads whether
// a run injected at all, and the one case about the order rows compose in
// compares one run's output against another's; no case writes down what the
// hook wrote, so a case about which model a row answers for writes rows only
// that model matches.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fixtureDir, type Result, runtimes } from "../../../tests/harness.mts";
import {
	configFile,
	homeNaming,
	hookRunner,
	injected,
	sessionId,
} from "./harness.mts";

const OPUS = "claude-opus-5";
const FABLE = "claude-fable-5-1";

const OPUS_HOME = homeNaming(OPUS);

/** One row, which Fable matches and Opus does not. */
const FABLE_ONLY = configFile("[models.'fable']\nprompt = \"FABLE\"\n");

const start = (session: string, model: string) => ({
	session_id: session,
	hook_event_name: "SessionStart",
	source: "startup",
	model,
});

const switched = (session: string, model: string) => ({
	session_id: session,
	hook_event_name: "PostModelSwitch",
	from_model: "claude-sonnet-4-5",
	to_model: model,
});

/** A compact, which carries no model id, so the session's record answers. */
const compacted = (session: string) => ({
	session_id: session,
	hook_event_name: "SessionStart",
	source: "compact",
});

function silent(result: Result): void {
	assert.equal(result.status, 0);
	assert.equal(result.stdout, "");
	assert.equal(result.stderr, "");
}

/** What a run put into the context, once it has passed `injected`. */
function injectedText(result: Result): string {
	injected(result);

	return result.stdout;
}

/**
 * The longest opening `one` and `other` share, which for two runs of the same
 * model is the header naming it: what follows in either one is that run's own
 * rows.
 */
function sharedStart(one: string, other: string): string {
	let shared = 0;

	while (shared < one.length && one[shared] === other[shared]) {
		shared += 1;
	}

	return one.slice(0, shared);
}

for (const runtime of runtimes()) {
	const run = hookRunner(runtime);
	const sid = () => sessionId(runtime);
	const name = (what: string) => `${runtime}: ${what}`;

	test(name("a matching row injects; a model it misses gets nothing"), () => {
		const only = configFile("[models.'opus-5\\b']\nprompt = \"OPUS\"\n");

		injected(run(start(sid(), OPUS), only));
		silent(run(start(sid(), FABLE), only));
	});

	test(name("a start without a model injects nothing"), () => {
		const only = configFile("[models.'opus-5\\b']\nprompt = \"OPUS\"\n");
		const bare = {
			session_id: sid(),
			hook_event_name: "SessionStart",
			source: "clear",
		};

		// A clear carries no model id and its session id is new, so no record
		// answers either. The first run is given a home whose settings.json
		// names a model the row matches, and stays silent all the same.
		silent(run(bare, only, { home: OPUS_HOME }));
		silent(run({ ...bare, session_id: sid() }, only));
	});

	test(name("a start with no model uses the one switched to earlier"), () => {
		const session = sid();

		injected(run(switched(session, FABLE), FABLE_ONLY));

		// A compact rebuilds the context without changing the model, so the
		// switch above is what answers, and not the home, which names Opus.
		injected(run(compacted(session), FABLE_ONLY, { home: OPUS_HOME }));

		// Still remembered after the record of what was injected is cleared.
		injected(run(compacted(session), FABLE_ONLY, { home: OPUS_HOME }));
	});

	test(name("a start naming a model replaces the remembered one"), () => {
		const session = sid();

		injected(run(switched(session, FABLE), FABLE_ONLY));
		silent(run(start(session, OPUS), FABLE_ONLY));

		// The start above is the last input that named a model.
		silent(run(compacted(session), FABLE_ONLY));
	});

	test(name("`every` injects on each switch into a matching model"), () => {
		const session = sid();
		const always = configFile(
			'[models.\'opus-5\\b\']\non_switch = "every"\nprompt = "EVERY"\n',
		);

		injected(run(switched(session, OPUS), always));
		injected(run(switched(session, OPUS), always));
	});

	test(name("`once` injects once; a session start re-arms it"), () => {
		const session = sid();
		const only = configFile(
			'[models.\'opus-5\\b\']\non_switch = "once"\nprompt = "ONCE"\n',
		);

		injected(run(switched(session, OPUS), only));
		silent(run(switched(session, OPUS), only));

		// The start injects since `on_start` is on by default, and the switch
		// after it is quiet again, because the text is in the context. That the
		// start also cleared the record is proved by the case below, not here.
		injected(run(start(session, OPUS), only));
		silent(run(switched(session, OPUS), only));
	});

	test(name("a start re-arms `once` for a row that is silent on it"), () => {
		const session = sid();
		const onSwitch = configFile(
			'[models.\'opus-5\\b\']\non_start = false\non_switch = "once"\nprompt = "ONCE"\n',
		);

		injected(run(switched(session, OPUS), onSwitch));
		silent(run(switched(session, OPUS), onSwitch));

		// The start injects nothing of its own here, so what re-arms the row is
		// the context the start rebuilt and nothing else: `once` means the text
		// is in this context, and this is a new one.
		silent(run(start(session, OPUS), onSwitch));
		injected(run(switched(session, OPUS), onSwitch));
	});

	test(name("`never` and `on_start = false` block opposite events"), () => {
		const never = configFile(
			'[models.\'opus-5\\b\']\non_switch = "never"\nprompt = "NEVER"\n',
		);
		const noStart = configFile(
			'[models.\'opus-5\\b\']\non_start = false\non_switch = "every"\nprompt = "SWITCH"\n',
		);

		injected(run(start(sid(), OPUS), never));
		silent(run(switched(sid(), OPUS), never));

		silent(run(start(sid(), OPUS), noStart));
		injected(run(switched(sid(), OPUS), noStart));
	});

	test(name("a row's `file` resolves beside the config file"), () => {
		const dir = fixtureDir("file-row");

		writeFileSync(join(dir, "rule.md"), "FROM A FILE\n");

		const path = join(dir, "config.toml");

		writeFileSync(path, "[models.'opus-5\\b']\nfile = \"rule.md\"\n");
		injected(run(start(sid(), OPUS), path));
	});

	// Rows compose rather than the first match winning, and they compose in the
	// order they are written: the run with both rows is measured against a run of
	// each row alone, the second of those past the header they share.
	// The general row is `once`: the switch to Fable, which only that row
	// matches, is silent because the switch to Opus spent it behind the
	// model-specific row.
	test(name("matching rows inject in the order they are written"), () => {
		const session = sid();
		const specific =
			'[models.\'opus-5\\b\']\non_switch = "every"\nprompt = "OPUS"\n';
		const general = '[models.\'.\']\non_switch = "once"\nprompt = "GENERAL"\n';
		const rows = configFile(`${specific}\n${general}`);

		const first = injectedText(
			run(switched(sid(), OPUS), configFile(specific)),
		);
		const second = injectedText(
			run(switched(sid(), OPUS), configFile(general)),
		);
		const both = injectedText(run(switched(session, OPUS), rows));

		assert.ok(both.startsWith(first), "the row written first is not first");
		assert.ok(
			both.endsWith(second.slice(sharedStart(first, second).length)),
			"the row written second is not last",
		);

		silent(run(switched(session, FABLE), rows));
	});

	// Each row keeps its own record of being in the context, so a row spent on
	// one model leaves a row for another free to inject once of its own.
	test(name("`once` is kept per row"), () => {
		const session = sid();
		const rows = configFile(
			'[models.\'opus-5\\b\']\non_switch = "once"\nprompt = "OPUS"\n\n[models.\'fable\']\non_switch = "once"\nprompt = "FABLE"\n',
		);

		injected(run(switched(session, OPUS), rows));
		injected(run(switched(session, FABLE), rows));
		silent(run(switched(session, OPUS), rows));
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
