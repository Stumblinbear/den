// Mutual exclusion between the hook runs of one session. Claude Code runs tool
// calls in parallel, so two of a plugin's entries can be in flight at once;
// whatever they read, change and write back has to hold the whole of that
// under one lock, or the second write undoes what the first one did.
//
// The lock is a directory: creating one is a single atomic operation on every
// platform, and the EEXIST it fails with is the answer to "is anyone else
// holding it".
//
// A lock is taken over only on proof that the run holding it is gone. The
// holder file names that run's pid, and a probe answering ESRCH -- no such
// process -- is the proof; a probe that succeeds, one refused and one that
// fails any other way are all a run still working. Age is no proof: a run
// merely slow to finish and one that was killed are the same age.
//
// What that leaves: a pid the OS has since given to some other process reads
// as a holder still running, and the lock stands until that process ends. It
// is the direction to fail in -- the other one puts two runs inside the
// section at once. A holder alive but hung holds its lock for as long as it
// hangs, and deleting the session's files from the plugin's temp directory is
// what clears either one.
import { randomUUID } from "node:crypto";
import {
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { errorCode, fieldsOf } from "./fields.mts";

/**
 * How long a run retries for before it gives up on the lock. Waiting stalls a
 * tool call and giving up skips a change; what one skipped change costs is
 * written where each caller handles it.
 */
const WAIT_MS = 200;

const RETRY_MS = 5;

/**
 * How long a directory naming nobody may stand before it stands for nobody.
 * Two of them name nobody: a lock in the moment between the mkdir that makes
 * it and the write that signs it, and the break, which is never signed at
 * all. Neither is held across a caller's work, so one still standing this
 * long after was left by a run that died inside it.
 */
const UNSIGNED_MS = 2000;

/**
 * The file a run writes inside the lock it just made, naming that run: the
 * token it knows its own lock by, and the pid every other run judges it by. A
 * lock deleted by hand and made again by the next run is indistinguishable
 * from the one it replaced -- on a temp filesystem it can come back with the
 * same inode and timestamp -- so a run recognises its own lock only by the
 * token it wrote into it.
 *
 * JSON, so that half a file, read while the run is writing it, parses as
 * nothing at all rather than as a pid with its last digits missing, which is
 * some other run's pid, or nobody's.
 */
const HOLDER = "holder";

/**
 * The lock taken to remove a lock, made beside the one it removes. Two runs
 * that judged the same holder dead would otherwise each remove the lock the
 * other took in its place, and that is two runs inside the section.
 */
const BREAK = ".break";

/** Where the break beside the lock at `path` is. */
const breakOf = (path: string): string => `${path}${BREAK}`;

/** Above this a number is no pid any platform hands out. */
const MAX_PID = 2 ** 31 - 1;

/** What one attempt at the lock directory found. */
type Attempt = "held" | "taken" | "unusable";

/** What a lock's holder file names. */
interface Holder {
	readonly token: string;
	/**
	 * Null for a field no probe may be handed: `kill(0, 0)` signals this run's
	 * whole process group and `kill(-1, 0)` every process the user owns, so
	 * anything that is not a plain pid stands for a holder still running.
	 */
	readonly pid: number | null;
}

// A waiting run has nothing else to do -- what it is waiting for is synchronous
// file work -- so it sleeps rather than yielding to a loop it does not have.
const IDLE = new Int32Array(new SharedArrayBuffer(4));

/**
 * What `underLock` came back with: the work's result for the run that held the
 * lock, and nothing at all for one that never got in, whose work did not
 * happen and has no result to stand in for.
 */
export type Locked<T> =
	| { readonly held: true; readonly result: T }
	| { readonly held: false };

/**
 * Runs `work` with the lock at `path` held, and releases it however `work`
 * ends. A lock this run cannot take within `WAIT_MS` skips the work entirely:
 * what a run does without its change is the caller's to decide.
 */
export function underLock<T>(path: string, work: () => T): Locked<T> {
	const token = take(path);

	if (token === null) {
		return { held: false };
	}

	try {
		return { held: true, result: work() };
	} finally {
		release(path, token);
	}
}

/** The token of the lock this run took, or nothing for a run that never got it. */
function take(path: string): string | null {
	const token = randomUUID();
	const until = Date.now() + WAIT_MS;

	for (;;) {
		const attempt = attemptAt(path, token);

		if (attempt !== "taken") {
			return attempt === "held" ? token : null;
		}

		if (Date.now() >= until) {
			return null;
		}

		// A lock this run has just taken over is free now, so it goes straight
		// back for it; anything else is a holder still working, to wait on.
		if (!reclaim(path)) {
			sleep(RETRY_MS);
		}
	}
}

function attemptAt(path: string, token: string): Attempt {
	try {
		mkdirSync(dirname(path), { recursive: true });
		mkdirSync(path);
	} catch (error) {
		// A temp directory that cannot be written is not going to become
		// writable inside `WAIT_MS`, so there is nothing to wait for.
		return errorCode(error) === "EEXIST" ? "taken" : "unusable";
	}

	try {
		writeFileSync(
			join(path, HOLDER),
			JSON.stringify({ token, pid: process.pid }),
		);

		return "held";
	} catch {
		// A lock this run could not sign is one it could never release again.
		remove(path);

		return "unusable";
	}
}

/**
 * Removes the lock at `path` if the run holding it is gone, and says whether
 * it did. The removal runs under the break, and the judgment is made again
 * with the break held: between the two the holder may have released the lock
 * and another run taken it, and that one is nobody's to remove.
 */
function reclaim(path: string): boolean {
	const holder = holderOf(path);

	if (!abandoned(path, holder)) {
		return false;
	}

	if (!takeBreak(path)) {
		return false;
	}

	try {
		return removeAbandoned(path, holder);
	} finally {
		remove(breakOf(path));
	}
}

/**
 * Takes the break beside the lock at `path`, or says another run has it. A
 * break standing is that other run judging this same lock, and this run has
 * its own retries to spend on what that one decides -- unless it was left by
 * a run that died inside it, which nothing else here clears.
 *
 * The retry is single, so two runs can come away holding the break, one of
 * them having cleared the other's fresh one. `removeAbandoned` judging the
 * lock a second time is what covers that.
 */
function takeBreak(path: string): boolean {
	const held = breakOf(path);

	if (make(held)) {
		return true;
	}

	if (!madeBefore(held, Date.now() - UNSIGNED_MS)) {
		return false;
	}

	remove(held);

	return make(held);
}

/** Makes the directory at `path`; false when another run got there first. */
function make(path: string): boolean {
	try {
		mkdirSync(path);

		return true;
	} catch {
		// Somebody else made it first, or nothing may be made there at all.
		return false;
	}
}

/** Removes the lock only while it is still the one `holder` was read from. */
function removeAbandoned(path: string, holder: Holder | null): boolean {
	const now = holderOf(path);

	if (!same(now, holder) || !abandoned(path, now)) {
		return false;
	}

	remove(path);

	return true;
}

/** Whether the lock at `path`, signed as `holder` says, stands for nobody. */
function abandoned(path: string, holder: Holder | null): boolean {
	if (holder === null) {
		return madeBefore(path, Date.now() - UNSIGNED_MS);
	}

	return holder.pid !== null && !alive(holder.pid);
}

/**
 * Whether the run under `pid` is still there. Nothing is signalled: the probe
 * is made for the error it fails with, and only ESRCH means gone.
 */
function alive(pid: number): boolean {
	try {
		process.kill(pid, 0);

		return true;
	} catch (error) {
		return errorCode(error) !== "ESRCH";
	}
}

/**
 * Whether the lock directory was made before `cutoff`. One that is no longer
 * there was made before nothing: what became of it is the next attempt's to
 * find out.
 */
function madeBefore(path: string, cutoff: number): boolean {
	try {
		return statSync(path).mtimeMs < cutoff;
	} catch {
		return false;
	}
}

/**
 * Releases the lock, and leaves alone one that is no longer this run's. The
 * temp directory is the user's to clear, and a lock deleted while its holder
 * is still working is made again by the next run: removing that one would put
 * a third run inside the critical section the second is in.
 */
function release(path: string, token: string): void {
	if (holderOf(path)?.token === token) {
		remove(path);
	}
}

/** Who a lock says it belongs to, and nothing for one that says nothing. */
function holderOf(path: string): Holder | null {
	let written: unknown;

	try {
		written = JSON.parse(readFileSync(join(path, HOLDER), "utf8"));
	} catch {
		// No file there yet, or half of one: either way it names nobody.
		return null;
	}

	const fields = fieldsOf(written);
	const token = fields["token"];

	return {
		// A token nothing wrote matches no run's, and this run's is a UUID.
		token: typeof token === "string" ? token : "",
		pid: pidIn(fields["pid"]),
	};
}

/** Whether two readings of a holder file name the same run. */
const same = (one: Holder | null, other: Holder | null): boolean =>
	one === null || other === null
		? one === other
		: one.token === other.token && one.pid === other.pid;

/** A field a probe may be handed, or nothing. */
const pidIn = (written: unknown): number | null =>
	typeof written === "number" &&
	Number.isInteger(written) &&
	written >= 1 &&
	written <= MAX_PID
		? written
		: null;

function remove(path: string): void {
	try {
		// A scanner or an indexer with the holder file open -- written a moment
		// ago, so the odds are highest right here -- fails the removal with a
		// transient EBUSY or EPERM, which is the class Node retries for.
		rmSync(path, {
			recursive: true,
			force: true,
			maxRetries: 3,
			retryDelay: 20,
		});
	} catch {
		// Left where it is: a lock is taken over once the run that made it
		// ends, and a break once it is old enough to be nobody's.
	}
}

const sleep = (ms: number): void => {
	Atomics.wait(IDLE, 0, 0, ms);
};
