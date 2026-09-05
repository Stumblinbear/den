// The lock a plugin reads and writes its session record under. Nothing here
// can interleave two hook processes, so what these cover is what one process
// leaves for the next: a lock released after the work, a lock another run
// holds skipping the work rather than doing it unlocked, a lock replaced
// under a run left standing by the run that no longer owns it, and the lock
// left by a run that died, which the next run proves dead and takes over.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, utimesSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { underLock } from "../lib/file-lock.mts";
import { fixtureDir, standingLock } from "./harness.mts";

const lockPath = (): string => join(fixtureDir("lock"), "record.lock");

/**
 * A pid every probe answers ESRCH for, which is what a lock left by a killed
 * run names. Not the pid of a reaped child: the machine is free to hand that
 * one straight to something else, and the cases beside these spawn runs of
 * their own. A lock naming a pid in use is never taken over.
 */
const GONE = 2 ** 31 - 1;

/** How far back a case sets a directory's mtime to age it out of a window. */
const aged = (): Date => new Date(Date.now() - 5000);

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

test("a lock whose holder has exited is taken over", () => {
	const path = lockPath();

	standingLock(path, GONE);

	assert.deepEqual(
		underLock(path, () => "ran"),
		{ held: true, result: "ran" },
		"the work of a run that took a dead holder's lock over happens",
	);
	assert.equal(existsSync(path), false, "the lock is released with the work");
	assert.equal(
		existsSync(`${path}.break`),
		false,
		"a break left standing is a lock nobody can take over again",
	);
});

test("a lock whose holder is still running stands", () => {
	const path = lockPath();

	standingLock(path, process.pid);

	assert.deepEqual(
		underLock(path, () => "ran"),
		{ held: false },
		"a run that answers a probe is a run still inside its change",
	);
	assert.ok(existsSync(path), "a live run's lock is left where it is");
});

// Between the directory a run makes and the holder it writes into it, a lock
// this run is about to be shut out by names nobody at all.
test("a lock nobody has signed yet stands", () => {
	const path = lockPath();

	standingLock(path, null);

	assert.deepEqual(
		underLock(path, () => "ran"),
		{ held: false },
		"an unsigned lock is a lock being taken, not one left behind",
	);
	assert.ok(existsSync(path), "the run signing it is given its moment");
});

test("a lock left unsigned for longer than that stands for nobody", () => {
	const path = lockPath();

	standingLock(path, null);
	utimesSync(path, aged(), aged());

	assert.deepEqual(
		underLock(path, () => "ran"),
		{ held: true, result: "ran" },
		"nothing takes that long to write one line, so nobody is coming",
	);
});

// Two runs that found the same dead holder must not remove a lock each other
// took in between, so the removal is itself under a lock. A run that cannot
// take that one leaves the takeover to whoever holds it.
test("a lock is left alone while another run holds the break", () => {
	const path = lockPath();

	standingLock(path, GONE);
	mkdirSync(`${path}.break`, { recursive: true });

	assert.deepEqual(
		underLock(path, () => "ran"),
		{ held: false },
		"one run at a time judges a lock dead, and this is not that run",
	);
	assert.ok(existsSync(path), "the dead holder's lock is still there to take");
});

// Nothing else clears a break, and one left standing leaves the session as
// stuck as the lock it was taken to remove. It names nobody and is held
// across no work of a caller's, so one standing long after is nobody's.
test("a break left standing by a run that died is cleared", () => {
	const path = lockPath();

	standingLock(path, GONE);
	mkdirSync(`${path}.break`, { recursive: true });
	utimesSync(`${path}.break`, aged(), aged());

	assert.deepEqual(
		underLock(path, () => "ran"),
		{ held: true, result: "ran" },
		"an orphaned break is not a run to wait for",
	);
	assert.equal(
		existsSync(`${path}.break`),
		false,
		"the break this run took is gone with the takeover it served",
	);
});
