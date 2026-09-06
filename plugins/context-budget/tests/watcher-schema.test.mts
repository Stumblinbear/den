// The schema the judge is held to, and the answer the CLI validates against it.
// With the schema in force the answer comes back as an object the CLI checked,
// beside the text the model wrote it as; before it, the object had to be found
// in that text. Both readings are still here, because a `command` of the user's
// own is handed no schema at all.
//
// What a verdict is then worth to the session is `watcher-verdict.test.mts`.
import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { runtimes } from "../../../tests/harness.mts";
import { ANSWER_SCHEMA } from "../lib/answer.mts";
import { fieldsOf } from "../lib/shared/fields.mts";
import { quiet } from "./harness.mts";
import {
	conversation,
	GOOD,
	injected,
	LATER,
	NOTICE,
	watcherRuns,
} from "./watcher-runs.mts";

for (const runtime of runtimes()) {
	const name = (what: string) => `${runtime}: ${what}`;

	// What the judge is started with, read back off the spawn: the schema
	// arrives as it was written, and it is still the one shape the CLI can wire
	// in as a tool's input schema. The fixture carries it where the default
	// command carries it, so this is what a real judge is sent.
	test(name("the judge is handed a schema it can parse"), () => {
		const { judge: seen, session, stop } = watcherRuns(runtime);

		seen.answers(LATER);
		quiet(stop(session(), conversation(NOTICE)));

		const argv = seen.argv();
		const schema = argv[argv.indexOf("--json-schema") + 1] ?? "";

		assert.equal(schema, ANSWER_SCHEMA, "the schema arrived unaltered");
		assert.equal(
			fieldsOf(JSON.parse(schema))["type"],
			"object",
			"and it is still the shape the CLI wires in as a tool's input schema",
		);
	});

	// The same schema, through the spawn that has to carry it on Windows. An
	// npm install leaves a CLI on PATH as a `.cmd`, which libuv finds for a bare
	// name only through the command interpreter, so a judge it could not start
	// is spawned a second time through that interpreter. `shell: true` reaches
	// the same interpreter and joins the arguments into one command line with no
	// quoting at all, which takes every quote out of the schema; the interpreter
	// is named here and handed the argument list. This case is the difference
	// between the two, and it can only run where that retry does.
	test(name("a judge reached through the interpreter is handed the schema"), {
		skip: process.platform === "win32" ? false : "the retry is Windows' own",
	}, () => {
		const {
			judge: seen,
			session,
			stop,
		} = watcherRuns(runtime, {
			shim: true,
		});

		seen.answers(LATER);
		quiet(stop(session(), conversation(NOTICE)));

		const argv = seen.argv();

		assert.equal(
			argv[argv.indexOf("--json-schema") + 1],
			ANSWER_SCHEMA,
			"the schema survived the interpreter",
		);
	});

	// The default command carries `--tools ""` beside the schema, which is what
	// keeps the judge from acting. The empty word is half of that argument, so a
	// reader that dropped it or refused the file would leave a judge holding
	// every tool this session holds, or no judge at all.
	test(name("an empty argument reaches the judge as written"), () => {
		const {
			judge: seen,
			session,
			stop,
		} = watcherRuns(runtime, {
			args: ["--tools", ""],
		});

		seen.answers(LATER);
		quiet(stop(session(), conversation(NOTICE)));

		assert.equal(seen.prompts().length, 1, "the judge was consulted");
		assert.deepEqual(
			seen.argv().slice(-2),
			["--tools", ""],
			"and the empty word arrived with it",
		);
	});

	// The validated object and the text it was written as are both in the
	// envelope, and they are not obliged to agree: the text is whatever the
	// model wrote, and the object is what the CLI checked against the schema.
	// Reading the text first would put an answer nothing validated ahead of the
	// one that was, which here is the difference between advice and a wait.
	test(name("a validated answer is read before the text beside it"), () => {
		const { judge: seen, session, stop } = watcherRuns(runtime);

		seen.answers({
			type: "result",
			subtype: "success",
			is_error: false,
			structured_output: GOOD,
			result: JSON.stringify({ good: false, wait: "later" }),
		});

		const said = String(injected(stop(session(), conversation(NOTICE))));

		assert.ok(said.includes("the record change is landed"), said);
		assert.ok(said.includes("/compact"), said);
	});

	// The schema's root is one object carrying the answer under `answer`, so
	// the object the CLI validated is that wrapper, and the verdict is what the
	// wrapper holds. Read as the answer itself, a wrapper carries no `good` at
	// all, which is silence: the consultation is spent and the session hears
	// nothing back.
	test(name("the validated answer is read from under `answer`"), () => {
		const { judge: seen, session, stop } = watcherRuns(runtime);

		seen.answers({
			type: "result",
			subtype: "success",
			is_error: false,
			structured_output: { answer: GOOD },
		});

		const said = String(injected(stop(session(), conversation(NOTICE))));

		assert.ok(said.includes("the record change is landed"), said);
		assert.ok(said.includes("/compact"), said);
	});

	// A judge of the user's own is handed no schema, so it writes no validated
	// object and the text is the whole of what there is. That reading is what
	// the `command` seam rests on, and it outlives the flag above.
	test(name("an envelope with no validated object is read as text"), () => {
		const { judge: seen, session, stop } = watcherRuns(runtime);

		seen.answers({
			type: "result",
			subtype: "success",
			is_error: false,
			result: `Here is my answer:\n\`\`\`json\n${JSON.stringify(GOOD)}\n\`\`\``,
		});

		const said = String(injected(stop(session(), conversation(NOTICE))));

		assert.ok(said.includes("the record change is landed"), said);
	});
}
