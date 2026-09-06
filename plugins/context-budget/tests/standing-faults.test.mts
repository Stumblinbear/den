// How long a session keeps hearing about a fault. A first report is said and
// then held back, since a line on every tool call is a line nobody reads; but
// a fault held back for a whole session leaves the context growing behind a
// plugin the user believes is watching it, so the tenth prompt it stands for
// says it again, and the twentieth after that. Prompts and not runs: a turn
// can carry twenty tool calls, and none of them is the user's chance to read
// anything. The prompt hook says the line whichever hook first met the fault,
// since a repeat reads the record back rather than claiming anything about the
// run making it. How a session hears that a fault is over is
// `fault-recovery.test.mts`.
//
// These run the real processes through the launcher, because the whole
// contract is out of band: an exit code, one line on stderr, and what the
// record carries between runs.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { test } from "node:test";
import { runtimes } from "../../../tests/harness.mts";
import { configFile, quiet, record, reported } from "./harness.mts";
import { BROKEN, HALF_FIXED, standingRuns, USABLE } from "./standing-runs.mts";

for (const runtime of runtimes()) {
	const {
		session: sid,
		crash,
		guardCrash,
		measured,
		prompt,
		toolCall,
	} = standingRuns(runtime);
	const name = (what: string) => `${runtime}: ${what}`;

	test(
		name("a standing config fault is said again on the tenth prompt"),
		() => {
			const session = sid();
			const path = configFile(BROKEN);

			reported(prompt(session, path), "config");

			for (let n = 2; n <= 9; n += 1) {
				quiet(prompt(session, path));
			}

			const tenth = reported(prompt(session, path), "config");

			assert.ok(tenth.includes("Standing for 10 prompts."), tenth);

			for (let n = 11; n <= 19; n += 1) {
				quiet(prompt(session, path));
			}

			const twentieth = reported(prompt(session, path), "config");

			assert.ok(twentieth.includes("Standing for 20 prompts."), twentieth);
		},
	);

	// A user who fixes the key the report named can have a second mistake
	// behind it. Held back by class alone, that second fault would never be
	// said at all, and the tenth prompt would go on quoting the line about the
	// mistake they have already dealt with.
	test(name("a second fault of a listed class is a first report"), () => {
		const session = sid();
		const path = configFile(BROKEN);

		reported(prompt(session, path), "config");
		writeFileSync(path, HALF_FIXED);

		const second = reported(prompt(session, path), "config");

		assert.ok(second.includes("is missing [default] urgent"), second);

		for (let n = 2; n <= 9; n += 1) {
			quiet(prompt(session, path));
		}

		const tenth = reported(prompt(session, path), "config");

		assert.ok(tenth.includes("is missing [default] urgent"), tenth);
		assert.ok(tenth.includes("Standing for 10 prompts."), tenth);
	});

	// The measurement hook runs on every tool call as well as every prompt, so
	// a count of its runs would say ten in a single turn.
	test(name("the tool calls between two prompts are not counted"), () => {
		const session = sid();
		const path = configFile(BROKEN);

		reported(prompt(session, path), "config");

		for (let n = 1; n <= 20; n += 1) {
			quiet(toolCall(session, path));
		}

		quiet(prompt(session, path));

		const listed = record(session)["reported"] as Record<
			string,
			{ prompts?: number }
		>;

		assert.equal(listed["config"]?.prompts, 2, "two prompts, twenty calls");
	});

	// The class the user can do nothing about repeats like the rest: a plugin
	// that has crashed is still a plugin that is not watching the context.
	test(name("an internal fault is said again the same way"), () => {
		const session = sid();
		const path = configFile(USABLE);

		reported(crash(session, path), "internal");

		for (let n = 2; n <= 9; n += 1) {
			quiet(crash(session, path));
		}

		const tenth = reported(crash(session, path), "internal");

		assert.ok(tenth.includes("Standing for 10 prompts."), tenth);
	});

	// Taking a fault back and being reminded of one are different questions.
	// A class the record lists is a class this session is still living with,
	// whichever hook listed it, so the prompt that makes the tenth says it
	// again: what it reads out is the record, not a claim of its own about
	// work it never did.
	test(name("a prompt says the guard's fault again on the tenth"), () => {
		const session = sid();
		const path = configFile(USABLE);

		reported(guardCrash(session, path), "internal");

		for (let n = 1; n <= 9; n += 1) {
			quiet(prompt(session, path));
		}

		const tenth = reported(prompt(session, path), "internal");

		assert.ok(tenth.includes("Standing for 10 prompts."), tenth);
	});

	// A reminder ends the way the first report did, on stderr and with the exit
	// Claude Code shows. A run with a notice to inject cannot end that way,
	// since that exit throws its stdout away, so the tenth prompt carries both
	// rather than trading the notice for news the session already has.
	test(name("a reminder never costs the run its own output"), () => {
		const session = sid();
		const path = configFile(USABLE);

		reported(guardCrash(session, path), "internal");

		for (let n = 1; n <= 9; n += 1) {
			quiet(prompt(session, path));
		}

		const tenth = measured(session, path);
		const said = String(
			(JSON.parse(tenth.stdout) as { systemMessage?: unknown }).systemMessage ??
				"",
		);

		assert.equal(tenth.status, 0, tenth.stderr);
		assert.ok(tenth.stdout.includes("NOTICE 200K over 150K"), tenth.stdout);
		assert.ok(said.includes("Standing for 10 prompts."), tenth.stdout);
	});
}
