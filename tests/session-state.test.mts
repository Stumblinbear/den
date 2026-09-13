// The lock every write of a session record takes, whichever writer makes it.
// Nothing here can interleave two hook processes; what this covers is what one
// process does when it finds another inside its change: leave the record
// exactly as it was, rather than write back over a change it never read. The
// named lock is the second kind here: taken beside the record, held across an
// await, and leaving the record's own lock free while it stands.
import assert from "node:assert/strict";
import { existsSync, utimesSync } from "node:fs";
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

// A run that has to be the only one of its kind the session has, holding its
// own lock for as long as that lasts. The lock is not the record's, so a hold
// of hours stops nobody from writing meanwhile.
test("a named lock stands beside the record and leaves the record's own free", async () => {
	const temp = fixtureDir("session-state-hold");
	const state = stateIn(temp);
	const session = "session-held";
	const named = join(temp, PLUGIN, `${session}.wake.lock`);

	const holding = await state.hold(session, "wake", async () => {
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});

		return {
			stands: existsSync(named),
			wrote: state.update(session, () => ({
				fields: { level: "notice" },
				result: "wrote",
			})),
		};
	});

	assert.deepEqual(holding, {
		held: true,
		result: { stands: true, wrote: { held: true, result: "wrote" } },
	});
	assert.equal(existsSync(named), false, "the hold ends where its work does");
	assert.deepEqual(
		state.read(session),
		{ level: "notice" },
		"the write the held run made under the record's own lock landed",
	);
});

// A hold is named by a free string, and two of the session's names are already
// spoken for: `json` is the record itself, `lock` the lock every write takes.
// A hold's name carries `.lock` on top of it, so `json` puts the hold at
// `<session>.json.lock` and neither of those two is reachable. A hold that
// landed on the record instead would find a file where it wants a directory,
// read no holder in it and remove it as abandoned, but only once it is older
// than the unsigned window; the record is aged past that so such a hold fails
// here rather than passing on a fresh record.
test("a hold named after the record's own suffix leaves the record standing", async () => {
	const temp = fixtureDir("session-state-hold-suffix");
	const state = stateIn(temp);
	const session = "session-suffixed";
	const record = join(temp, PLUGIN, `${session}.json`);
	const aged = new Date(Date.now() - 5000);

	state.update(session, () => ({ fields: { level: "notice" }, result: null }));
	utimesSync(record, aged, aged);

	await state.hold(session, "json", () => Promise.resolve());

	assert.deepEqual(
		state.read(session),
		{ level: "notice" },
		"a hold named after the record leaves the record as it was",
	);
});
