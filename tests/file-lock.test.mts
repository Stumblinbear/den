// The lock a plugin reads and writes its session record under. Nothing here
// can interleave two hook processes, so what these cover is what one process
// leaves for the next: a lock released after the work, a lock another run
// holds skipping the work rather than doing it unlocked, and a lock replaced
// under a run left standing by the run that no longer owns it.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { underLock } from "../lib/file-lock.mts";
import { fixtureDir } from "./harness.mts";

const lockPath = (): string => join(fixtureDir("lock"), "record.lock");

test("the lock stands for the work and is gone after it", () => {
	const path = lockPath();

	assert.deepEqual(
		underLock(path, () => existsSync(path)),
		{ held: true, result: true },
		"a run holding the lock is what another run has to find",
	);
	assert.equal(existsSync(path), false, "a released lock leaves nothing");
});

// The second run stands for a hook run of the same session in flight beside
// the first. Nothing it was going to do happens, and it is told so rather than
// handed a result it can mistake for one: writing the record it could not read
// under the lock is the lost update the lock exists to prevent.
test("a lock another run holds skips the work and says so", () => {
	const path = lockPath();
	let ran = 0;

	const outer = underLock(path, () =>
		underLock(path, () => {
			ran += 1;

			return "ran";
		}),
	);

	assert.deepEqual(outer, { held: true, result: { held: false } });
	assert.equal(ran, 0, "the work of a run that never got in never happened");
});

// Clearing the temp directory is what the troubleshooting has a user do, and
// it can land on a lock a run is inside; the next run then makes its own at
// the same path. What the first run must not do on its way out is remove that
// one, which would put a third run inside the section the second is in.
test("a run releases only a lock carrying its own token", () => {
	const path = lockPath();

	underLock(path, () => {
		rmSync(path, { recursive: true, force: true });
		mkdirSync(path, { recursive: true });
	});

	assert.ok(
		existsSync(path),
		"a run must not release a lock another run is inside",
	);
});
