// The one file a session leaves behind, and everything that reads or writes
// it: the measurement hook writes the transcript it read into it on every run,
// the resume guard spends answers in it, the shared reporter lists the faults
// the session has been told about in it, and the cut-point script finds the
// transcript through it. None of them knows the others' fields, so what any of
// them writes must leave the rest of the file where it was -- and there must be
// exactly one file, since a fault class in a file of its own is a second place
// to look and a second thing to delete.
import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { type Result, runtimes } from "../../../tests/harness.mts";
import { assistant, at, prompt } from "./fixtures.mts";
import {
	configFile,
	DEFAULTS,
	GUARD,
	GUARD_MESSAGES,
	hookRunner,
	MESSAGES,
	quiet,
	reading,
	record,
	recorder,
	reported,
	scriptRunner,
	sessionId,
	stateFiles,
	subagentSession,
	transcript,
	withoutParser,
} from "./harness.mts";

interface Injection {
	readonly hookSpecificOutput?: { readonly additionalContext?: string };
}

const CONFIG = configFile(DEFAULTS, MESSAGES, GUARD, GUARD_MESSAGES);

/** A file that parses and is missing everything but `[default]`. */
const NO_MESSAGES = "[default]\nnotice = 1\nurgent = 2\n";

function injected(result: Result): string | null {
	assert.equal(result.status, 0, result.stderr);

	if (result.stdout === "") {
		return null;
	}

	const output = JSON.parse(result.stdout) as Injection;

	return output.hookSpecificOutput?.additionalContext ?? null;
}

for (const runtime of runtimes()) {
	const hook = hookRunner(runtime);
	const script = scriptRunner(runtime);
	const measure = recorder(runtime);
	const sid = () => sessionId(runtime);
	const name = (what: string) => `${runtime}: ${what}`;
	const inject = (session: string, path: string, config = CONFIG) =>
		hook(
			"context-budget",
			{
				hook_event_name: "UserPromptSubmit",
				session_id: session,
				transcript_path: path,
			},
			config,
		);

	test(name("a run below every threshold still records the transcript"), () => {
		// The cut-point script is handed a session id and nothing else, and the
		// record is the only thing that turns that into a transcript path. It is
		// written on every run for exactly that reason: a session where nothing
		// has ever been injected is the common case, and the skill is invokable
		// in it.
		const session = sid();
		const path = transcript(assistant(50_000));

		assert.equal(injected(inject(session, path)), null, "50K is under 150K");

		const written = record(session);

		assert.equal(
			written["transcript_path"],
			path,
			"the path the script has to find",
		);
		assert.equal(written["level"], "none", "nothing has been announced");
	});

	test(
		name("a model whose row is switched off is recorded all the same"),
		() => {
			// A row switched off is the whole plugin off for the models it matches --
			// and the session still needs a transcript path the skill can read.
			const off = configFile(
				DEFAULTS,
				"[models.'fable']\nenabled = false\n",
				MESSAGES,
				GUARD,
				GUARD_MESSAGES,
			);
			const session = sid();
			const path = transcript(
				assistant(260_000, { model: "claude-fable-5-1" }),
			);

			assert.equal(injected(inject(session, path, off)), null);

			const written = record(session);

			assert.equal(written["transcript_path"], path);
			assert.equal(
				written["level"],
				"none",
				"a row that cannot inject cannot announce a level",
			);
		},
	);

	test(name("a reported fault leaves the session one file, the record"), () => {
		const session = sid();
		const path = transcript(assistant(200_000));
		const broken = configFile(NO_MESSAGES);

		reported(inject(session, path, broken), "config");
		quiet(inject(session, path, broken));

		assert.deepEqual(
			stateFiles(session),
			[`${session}.json`],
			"the class is recorded in the record, not in a file of its own",
		);
	});

	test(name("both fault classes share that one file"), () => {
		const session = sid();
		const launcher = withoutParser();
		const path = transcript(assistant(200_000));
		const broken = configFile(NO_MESSAGES);
		const guard = (options: { launcher: string }) =>
			hook(
				"resume-guard",
				{
					hook_event_name: "PreToolUse",
					tool_name: "SendMessage",
					session_id: session,
					tool_input: { to: "big" },
					transcript_path: subagentSession("big", [assistant(162_300)], ["{}"]),
				},
				CONFIG,
				options,
			);

		reported(guard({ launcher }), "parser");
		reported(inject(session, path, broken), "config");

		quiet(guard({ launcher }));
		quiet(inject(session, path, broken));

		assert.deepEqual(stateFiles(session), [`${session}.json`]);
	});

	// The transcript path and the reported classes are written by different runs
	// at different moments, and neither has any business dropping the other's.
	test(
		name("recording a fault keeps the transcript the record already held"),
		() => {
			const session = sid();
			const path = configFile(DEFAULTS, MESSAGES, GUARD, GUARD_MESSAGES);
			const measured = transcript(assistant(200_000));

			assert.equal(
				injected(inject(session, measured, path)),
				"NOTICE 200K over 150K",
			);

			writeFileSync(path, NO_MESSAGES);
			reported(inject(session, measured, path), "config");

			assert.deepEqual(stateFiles(session), [`${session}.json`]);

			const written = record(session);

			assert.equal(
				written["transcript_path"],
				measured,
				"the transcript path survives",
			);
			assert.equal(
				written["level"],
				"notice",
				"so does the level already posted",
			);
		},
	);

	test(name("the script finds the transcript from the session id"), () => {
		const session = sid();
		const path = transcript(
			assistant(100_000, { minutesAgo: 55 }),
			prompt("Read the brief and start on the scanner", at(50)),
			assistant(150_000, { minutesAgo: 40 }),
			prompt("Now add the skill that takes a fresh reading", at(35)),
			assistant(200_000, { minutesAgo: 30 }),
		);

		measure(session, path);

		// Everything but the first line, which carries the clock and would
		// differ between two runs that straddle a minute.
		const list = (out: string) => out.split("\n").slice(1).join("\n");

		assert.equal(
			list(reading(script(session))),
			list(reading(script("", ["--transcript", path]))),
			"the record the hook wrote points at the same transcript",
		);
	});

	test(
		name("a recorded transcript that has gone is named, not called absent"),
		() => {
			// A transcript moved or deleted after a measurement is not a session the
			// hook has never run in, and the two have different answers: the reader
			// of "no measurement recorded" goes looking for an uninstalled plugin.
			// The record is the only thing that knows which path went missing, so it
			// is handed on to be reported by name.
			const session = sid();
			const path = transcript(assistant(200_000));

			measure(session, path);
			rmSync(path);

			const out = reading(script(session));

			assert.match(
				out,
				/could not be read \(ENOENT\), so the cache window is unknown/,
				"the recorded path is read and the read is what fails",
			);
			assert.ok(
				out.includes(path),
				`the path that went missing is named: ${out}`,
			);
		},
	);

	test(
		name("a session the hook has never measured is reported, not guessed"),
		() => {
			const out = reading(script(sid()));

			assert.match(out, /^No measurement recorded for this session/);
			assert.match(
				out,
				/--transcript/,
				"the agent is told how to get one anyway",
			);
		},
	);

	test(name("a run passed no session id reads the same way"), () => {
		// A shell Claude Code did not start has no session id to substitute into
		// the skill's preamble, and a hand run passes none.
		assert.match(
			reading(script("")),
			/^No measurement recorded for this session/,
		);
	});
}
