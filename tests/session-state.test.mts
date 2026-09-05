// The lock every write of a session record takes, whichever writer makes it.
// Nothing here can interleave two hook processes; what this covers is what one
// process does when it finds another inside its change -- leave the record
// exactly as it was, rather than write back over a change it never read.
import assert from "node:assert/strict";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { sessionState } from "../lib/session-state.mts";
import { fixtureDir, standingLock } from "./harness.mts";

/** The directory name the records under the case's temp directory go in. */
const PLUGIN = "claude-session-state-test";

/**
 * A state whose records land in a throwaway directory: `tmpdir()` is read off
 * the environment on every call, the way the harness gives a hook run its own.
 */
function stateIn(temp: string) {
	for (const name of ["TMPDIR", "TEMP", "TMP"]) {
		// biome-ignore lint/style/noProcessEnv: what the record is written under is the temp directory the process names, and naming another is the whole of the isolation a case gets.
		process.env[name] = temp;
	}

	return sessionState(PLUGIN);
}

test("a lock another run holds leaves the record as it was", () => {
	const temp = fixtureDir("session-state");
	const state = stateIn(temp);
	const session = "session-under-lock";

	assert.deepEqual(
		state.update(session, () => ({
			fields: { level: "notice" },
			result: "wrote",
		})),
		{ held: true, result: "wrote" },
		"the first run has nobody to wait for, and its change lands",
	);

	// The lock a hook run of the same session is inside, signed by this
	// process, which is a run still working: a lock naming a run that has
	// ended is taken over rather than waited on.
	standingLock(join(temp, PLUGIN, `${session}.lock`), process.pid);

	assert.deepEqual(
		state.update(session, () => ({
			fields: { level: "urgent" },
			result: "wrote",
		})),
		{ held: false },
		"a run that never got in has no result to be handed",
	);

	assert.deepEqual(
		state.read(session),
		{ level: "notice" },
		"the write did not land on the record the held lock stands for",
	);
});

test("a field set to undefined is removed, and one set to null is kept", () => {
	const state = stateIn(fixtureDir("session-state-removal"));
	const session = "session-removing";

	state.update(session, () => ({
		fields: { level: "notice", consumed: ["3f2a"] },
		result: undefined,
	}));
	state.update(session, () => ({
		fields: { level: undefined, consumed: null },
		result: undefined,
	}));

	assert.deepEqual(
		state.read(session),
		{ consumed: null },
		"the serializer drops an undefined field and writes a null one",
	);
});
