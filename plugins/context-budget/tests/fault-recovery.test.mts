// How a session hears that a fault is over. A run that meets no fault takes
// the report back, in the field Claude Code shows the user rather than as a
// failed hook. Only a prompt run of the measurement hook does, and only for
// what its own work covers: a run can meet no fault by leaving before the work
// that raises one, as every tool call from a subagent does, and no run of the
// measurement hook opens the subagent transcript the guard reads. How long a
// session keeps hearing about a fault that stands is
// `standing-faults.test.mts`.
//
// These run the real processes through the launcher, because the whole
// contract is out of band: an exit code, one line on stderr, and what the
// record carries between runs.
import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { runtimes } from "../../../tests/harness.mts";
import { assistant } from "./fixtures.mts";
import {
	configFile,
	quiet,
	record,
	recovered,
	reported,
	subagentSession,
} from "./harness.mts";
import { BROKEN, standingRuns, USABLE } from "./standing-runs.mts";

for (const runtime of runtimes()) {
	const {
		session: sid,
		crash,
		guardCrash,
		guardOn,
		measured,
		prompt,
		run,
	} = standingRuns(runtime);
	const name = (what: string) => `${runtime}: ${what}`;

	// A subagent's tool call reaches the hook with the session's own id and
	// ends without a fault, having done nothing: the config it would have read
	// is still broken, and the session must not be told otherwise.
	test(name("a subagent's tool call is not a run that worked"), () => {
		const session = sid();
		const path = configFile(BROKEN);

		reported(prompt(session, path), "config");
		quiet(run(session, "PostToolUse", path, { agent_id: "some-subagent" }));
		quiet(prompt(session, path));
	});

	test(name("a run that works again says so, once"), () => {
		const session = sid();
		const path = configFile(BROKEN);

		reported(prompt(session, path), "config");
		writeFileSync(path, USABLE);

		// The run that finds the fault gone is a run like any other, so what it
		// has to say to Claude goes out beside what it has to say to the user.
		const back = measured(session, path);

		recovered(back, "config");
		assert.ok(back.stdout.includes("NOTICE 200K over 150K"), back.stdout);
		assert.equal(
			"reported" in record(session),
			false,
			"nothing is listed, so the next fault is a first report",
		);

		quiet(prompt(session, path));

		// The same fault again is the same fault the session was told about,
		// and it is told again from the top rather than in the middle of a
		// count that was still running.
		writeFileSync(path, BROKEN);

		const recurred = reported(prompt(session, path), "config");

		assert.ok(!recurred.includes("Standing"), recurred);
	});

	// The measurement hook never opens a subagent's transcript, so a prompt of
	// it working says nothing about one the guard could not read. Calling that
	// fault over would be a plain untruth, and it would leave the next resume
	// that meets the same failure sounding like the first.
	test(name("a prompt does not take back what only the guard met"), () => {
		const session = sid();
		const path = configFile(USABLE);

		reported(guardCrash(session, path), "internal");
		quiet(prompt(session, path));
		quiet(guardCrash(session, path));
	});

	// The other half of the same rule: the hook that listed an internal fault
	// of its own is the hook whose next working prompt is evidence about it.
	test(name("a prompt takes back the internal fault it listed itself"), () => {
		const session = sid();
		const path = configFile(USABLE);

		reported(crash(session, path), "internal");
		recovered(prompt(session, path), "internal");
	});

	// One listing per class would hold whichever hook crashed first and lose
	// the other: the guard's crash would never be said, and the next working
	// prompt would call the class over while the guard's fault still stands.
	test(name("each hook's internal fault is listed on its own"), () => {
		const session = sid();
		const path = configFile(USABLE);

		reported(crash(session, path), "internal");
		reported(guardCrash(session, path), "internal");

		// The prompt is evidence about its own crash and about nothing the
		// guard met, so it takes back one of the two.
		recovered(prompt(session, path), "internal");
		quiet(guardCrash(session, path));
	});

	// A prompt from a subagent reaches this hook under the session's own id
	// and leaves before it measures anything, so the transcript read that the
	// internal fault came out of was never made again.
	test(name("a prompt that leaves early takes back nothing"), () => {
		const session = sid();
		const path = configFile(USABLE);

		reported(crash(session, path), "internal");
		quiet(
			run(session, "UserPromptSubmit", path, { agent_id: "some-subagent" }),
		);
		quiet(crash(session, path));
		assert.ok("reported" in record(session), "the class is still listed");
	});

	// Deleting the file is one of the two fixes every config report names, and
	// the run that finds it gone has read the configuration through: there is
	// nothing wrong with it any more, and nothing left to measure either.
	test(name("a prompt that finds the config deleted takes it back"), () => {
		const session = sid();
		const path = configFile(BROKEN);

		reported(prompt(session, path), "config");
		rmSync(path);
		recovered(prompt(session, path), "config");
	});

	// A subagent's tool call reaches this hook under the session's own id, and
	// nothing but the input says a prompt could not. Whatever it says, a run
	// has to have read the configuration before its silence means anything.
	test(name("a prompt from a subagent takes nothing back"), () => {
		const session = sid();
		const path = configFile(BROKEN);

		reported(prompt(session, path), "config");
		quiet(
			run(session, "UserPromptSubmit", path, { agent_id: "some-subagent" }),
		);
		quiet(prompt(session, path));
		assert.ok("reported" in record(session), "the class is still listed");
	});

	// A prompt Claude Code names no transcript in leaves the hook nothing to
	// measure, which is not the same as a run that worked: the configuration
	// it reads first is still the broken one.
	test(name("a prompt with no transcript to read takes nothing back"), () => {
		const session = sid();
		const path = configFile(BROKEN);

		reported(prompt(session, path), "config");
		quiet(
			run(session, "UserPromptSubmit", path, { transcript_path: undefined }),
		);
		quiet(prompt(session, path));
		assert.ok("reported" in record(session), "the class is still listed");
	});

	// Two classes listed and one run that answers for one of them: what it
	// covers goes, and the record keeps the rest rather than being emptied.
	test(name("a prompt keeps the class it does not answer for"), () => {
		const session = sid();
		const path = configFile(USABLE);

		reported(guardCrash(session, path), "internal");
		writeFileSync(path, BROKEN);
		reported(prompt(session, path), "config");
		writeFileSync(path, USABLE);
		recovered(prompt(session, path), "config");
		quiet(guardCrash(session, path));
	});

	// Both hooks read one file through one parser, so the prompt run that
	// reads it fixed answers for the class whichever of them reported it.
	test(name("a prompt takes back the config fault the guard reported"), () => {
		const session = sid();
		const path = configFile(BROKEN);
		const resume = subagentSession("big", [assistant(162_300)], ["{}"]);

		reported(guardOn(session, resume, path), "config");
		writeFileSync(path, USABLE);
		recovered(prompt(session, path), "config");
	});
}
