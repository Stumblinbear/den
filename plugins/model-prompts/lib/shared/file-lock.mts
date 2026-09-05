// Mutual exclusion between the hook runs of one session. Claude Code runs tool
// calls in parallel, so two of a plugin's entries can be in flight at once;
// whatever they read, change and write back has to hold the whole of that
// under one lock, or the second write undoes what the first one did.
//
// The lock is a directory: creating one is a single atomic operation on every
// platform, and the EEXIST it fails with is the answer to "is anyone else
// holding it".
//
// Nothing here takes a lock over. Age is all a waiter could judge one by, and
// a run merely slow to finish is indistinguishable from one that was killed,
// so a takeover on age is how two runs end up inside the section at once. What
// that costs instead: a lock left behind -- by a process killed while it held
// one, or by a removal that failed even after its retries -- stands for the
// rest of that session, and every run after it skips its own read, change and
// write. Deleting that session's files from the plugin's temp directory is
// what clears it.
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { errorCode } from "./fields.mts";

/**
 * How long a run retries for before it gives up on the lock. Waiting stalls a
 * tool call and giving up skips a change; what one skipped change costs is
 * written where each caller handles it.
 */
const WAIT_MS = 200;

const RETRY_MS = 5;

/**
 * The file a run writes inside the lock it just made, naming that run. A lock
 * deleted by hand and made again by the next run is indistinguishable from the
 * one it replaced -- on a temp filesystem it can come back with the same inode
 * and timestamp -- so a run recognises its own lock only by the token it wrote
 * into it.
 */
const HOLDER = "holder";

/** What one attempt at the lock directory found. */
type Attempt = "held" | "taken" | "unusable";

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

		sleep(RETRY_MS);
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
		writeFileSync(join(path, HOLDER), token);

		return "held";
	} catch {
		// A lock this run could not sign is one it could never release again.
		remove(path);

		return "unusable";
	}
}

/**
 * Releases the lock, and leaves alone one that is no longer this run's. The
 * temp directory is the user's to clear, and a lock deleted while its holder
 * is still working is made again by the next run: removing that one would put
 * a third run inside the critical section the second is in.
 */
function release(path: string, token: string): void {
	if (holderOf(path) === token) {
		remove(path);
	}
}

/** Who a lock says it belongs to, and nothing for one that says nothing. */
function holderOf(path: string): string | null {
	try {
		return readFileSync(join(path, HOLDER), "utf8");
	} catch {
		return null;
	}
}

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
		// Left where it is, and every run of this session after it skips its
		// change, until the temp directory is cleared.
	}
}

const sleep = (ms: number): void => {
	Atomics.wait(IDLE, 0, 0, ms);
};
