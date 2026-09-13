// What arms the cache wake, one case per gate. A Stop that fails a gate leaves
// the session exactly as it was: nothing on the wire, nothing for the agent,
// and no line about it, since a session with no inbox or no work to wait on is
// not a fault to report. Every case runs the real entry through the launcher
// against an inbox listening in this process.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	type Result,
	type Runtime,
	runtimes,
} from "../../../tests/harness.mts";
import { SOCKET_VARIABLE, TOKEN_VARIABLE } from "../lib/inbox.mts";
import { hookEnv, noTranscript } from "./harness.mts";
import {
	idling,
	NO_INBOX,
	ROW_OFF,
	WAKE,
	WAKE_OFF,
	type WakeRuns,
	wakeRuns,
} from "./wake-runs.mts";

/**
 * Runs one Stop under `section` and asserts it did nothing: the run ended on
 * its own, wrote nothing for the agent and posted nothing.
 */
async function silent(
	runtime: Runtime,
	section: string,
	stop: (runs: WakeRuns) => Result,
): Promise<void> {
	const runs = await wakeRuns(runtime, section);

	try {
		const result = stop(runs);

		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stderr, "", "nothing on stderr");
		assert.equal(result.stdout, "", "nothing for the agent");
		assert.deepEqual(runs.inbox.lines(), [], "nothing on the wire");
	} finally {
		await runs.close();
	}
}

// What keeps the cases below out of the session running them: the wake posts
// to whatever inbox its environment names, and a child that inherited this
// process's pair would post into that session rather than into the fixture.
// Nothing else pins it down, since a wake that leaked lands where no other
// assertion here is looking.
test("a run hands its child no inbox but the one the case names", () => {
	const given = hookEnv();

	assert.ok(SOCKET_VARIABLE in given, "the socket is taken out by name");
	assert.equal(given[SOCKET_VARIABLE], undefined);
	assert.ok(TOKEN_VARIABLE in given, "and the token with it");
	assert.equal(given[TOKEN_VARIABLE], undefined);
	assert.equal(
		hookEnv({ [SOCKET_VARIABLE]: "the fixture's own" })[SOCKET_VARIABLE],
		"the fixture's own",
		"what a case names goes over both",
	);
});

for (const runtime of runtimes()) {
	const name = (what: string) => `${runtime}: ${what}`;

	test(name("a subagent's Stop is not the session whose cache this is"), () =>
		silent(runtime, WAKE, (runs) =>
			runs.stop(runs.session(), idling(), {
				input: { agent_id: "agent-survey" },
			}),
		),
	);

	test(name("the wake switched off posts nothing"), () =>
		silent(runtime, WAKE_OFF, (runs) => runs.stop(runs.session(), idling())),
	);

	test(name("a session that named no inbox is left to go cold"), () =>
		silent(runtime, WAKE, (runs) =>
			runs.stop(runs.session(), idling(), { env: NO_INBOX }),
		),
	);

	test(name("a session waiting on nothing has no stretch to sit out"), () =>
		silent(runtime, WAKE, (runs) =>
			runs.stop(runs.session(), idling({ tasks: [] })),
		),
	);

	test(name("a cache already cold is left to be rebuilt"), () =>
		silent(runtime, WAKE, (runs) =>
			runs.stop(runs.session(), idling({ minutesAgo: 6 })),
		),
	);

	test(name("a transcript that is not there is silence, not a fault"), () =>
		silent(runtime, WAKE, (runs) => runs.stop(runs.session(), noTranscript())),
	);

	test(name("the row for the lifetime in force is switched off"), () =>
		silent(runtime, ROW_OFF, (runs) => runs.stop(runs.session(), idling())),
	);
}
